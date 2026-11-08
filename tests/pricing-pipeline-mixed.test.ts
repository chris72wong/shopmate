import { describe, expect, it } from "vitest";
import type { RetailProductObservation } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { ServiceError } from "@/server/errors";
import { createRetailPricingService, type RetailAdapter } from "@/server/pricing/service";
import type { BranchBinding, ProductMapping } from "@/server/pricing/retail-config";
import { purchasePackages } from "@/server/optimization/packages";
import { createPackageOptimizer } from "@/server/optimization/engine";
import { recipes } from "@/data/recipes";
import { matchVerifiedOffer } from "@/server/pricing/matching";
import { optimizationRequest } from "./fixtures";

const now = Date.parse("2026-11-07T12:00:00Z");
const bindings: BranchBinding[] = ["Loblaws", "No Frills", "Zehrs"].map((retailer, index) => ({ googlePlaceId: `mixed-${index}`, providerId: "reef-loblaws", retailer, country: "CA", providerStoreId: `mixed-${index}`, channel: "pickup", banner: index === 0 ? "loblaw" : index === 1 ? "nofrills" : "zehrs",
  address: { line1: `${index + 1} Synthetic Street`, city: "Test City", region: "ON", postalCode: "M5V 2T6" } }));
const stores = bindings.map(binding => ({ id: `google:${binding.googlePlaceId}`, name: binding.retailer, address: `${binding.address.line1}, Test City, ON M5V 2T6`, country: "CA" as const, source: "google" as const, chainId: null, pricing: { status: "unavailable" as const, profileId: null } }));
const recipeIds = ["rice", "chickpeas", "spinach", "tomato", "olive-oil", "lemon-juice"];
const mappings: ProductMapping[] = bindings.flatMap(binding => ingredients.map(ingredient => ({ providerId: binding.providerId, retailer: binding.retailer,
  ingredientId: ingredient.id, productId: `sku-${ingredient.id}`, expectedName: ingredient.name, expectedBrand: "Synthetic Brand",
  netQuantity: { quantity: ingredient.unit === "each" ? 12 : 500, unit: ingredient.unit },
  usableQuantity: { quantity: ingredient.unit === "each" ? 12 : ingredient.id === "chickpeas" ? 240 : 500, unit: ingredient.unit },
  preparation: ingredient.name.includes("(dry)") ? "dry" : ingredient.name.includes("drained") ? "drained" : ingredient.name.includes("edible") ? "edible" : ingredient.name.includes("(raw)") ? "raw" : "as-sold",
  contentEvidenceUrl: "https://example.org/synthetic-review" })));
function observation(binding: BranchBinding, name: string, price = 100): RetailProductObservation {
  const mapping = mappings.find(item => item.retailer === binding.retailer && item.expectedName === name)!;
  return { providerId: binding.providerId, retailer: binding.retailer, country: binding.country, providerStoreId: binding.providerStoreId, productId: mapping.productId!, gtin: null,
    name, brand: mapping.expectedBrand, category: null, packageLabel: `${mapping.netQuantity.quantity} ${mapping.netQuantity.unit}`, packageQuantity: mapping.netQuantity,
    regularPrice: { amountCents: price, currency: "CAD" }, regularPriceIsCurrent: true, promotionalPrice: null, promotions: [], unitPrice: null,
    availability: "available", channel: binding.channel, scope: "branch", priceIsEstimate: false, retrievedAt: new Date(now).toISOString(), sourceObservedAt: null, providerUpdatedAt: null,
    expiresAt: new Date(now + 300_000).toISOString(), sourceUrl: "https://example.org/synthetic-product" };
}
function service(search: RetailAdapter["search"], selectedMappings = mappings, evaluationLimit?: number) {
  return createRetailPricingService({ config: { bindings, mappings: selectedMappings }, adapter: { configured: () => true, verifyBranch: async () => {}, search }, now: () => now, engineOptions: { evaluationLimit } });
}
function request(budget = 8000) {
  const input = optimizationRequest(); input.mode = "live"; input.storeIds = stores.map(store => store.id);
  input.preferences = { ...input.preferences, mealCount: 1, objective: "minimize-cost", nutritionPriorities: [], weeklyBudget: { amountCents: budget, currency: "CAD" } };
  return input;
}

describe("ingredient pipeline and mixed-store planning", () => {
  it("queries all 31 reviewed ingredients rather than silently truncating coverage at twelve", async () => {
    const result = await service(async (binding, query) => [observation(binding, query)]).pricing("live", "CA", stores);
    for (const store of result.stores) {
      expect(store.status).toBe("available");
      if (store.status === "available") { expect(store.offers).toHaveLength(31); expect(store.missingIngredientIds).toEqual([]); }
    }
  });
  it("retains fresh usable offers and complete recommendations after a later SKU request is rate-limited", async () => {
    const selected = mappings.filter(mapping => recipeIds.includes(mapping.ingredientId) || mapping.ingredientId === "yogurt");
    const result = await service(async (binding, query) => {
      if (query === ingredients.find(item => item.id === "yogurt")!.name) throw new ServiceError(429, { code: "rate-limited", message: "Synthetic rate limit" });
      return [observation(binding, query)];
    }, selected).optimize(request(), stores);
    expect(result.status).toBe("feasible");
    expect(result.pricing.notices.join(" ")).toContain("Fresh verified offers are retained");
    expect(result.pricing.stores.every(store => store.status === "available" && store.offers.length === 6 && store.missingIngredientIds.includes("yogurt"))).toBe(true);
  });
  it("finds a complete mixed plan from complementary partial stores without inventing a single-store total or savings", async () => {
    const result = await service(async (binding, query) => {
      const ingredientId = mappings.find(item => item.expectedName === query)!.ingredientId;
      return Math.floor(recipeIds.indexOf(ingredientId) / 2) === bindings.indexOf(binding) ? [observation(binding, query)] : [];
    }, mappings.filter(mapping => recipeIds.includes(mapping.ingredientId))).optimize(request(600), stores);
    expect(result).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", minimumKnownCost: null });
    expect(result).not.toHaveProperty("total");
    expect(result.mixedStorePlan).toMatchObject({ basis: "verified", total: { amountCents: 600, currency: "CAD" }, budgetRemaining: { amountCents: 0, currency: "CAD" }, savings: null, optimality: "proven" });
    expect(result.mixedStorePlan?.stores).toHaveLength(3);
    expect(result.mixedStorePlan?.lines.reduce((total, line) => total + line.subtotal.amountCents, 0)).toBe(600);
  });
  it("calculates same-plan verified savings, stable branch ties, scaling and package purchases", async () => {
    const result = await service(async (binding, query) => {
      const id = mappings.find(item => item.expectedName === query)!.ingredientId;
      const storeIndex = bindings.indexOf(binding);
      return [observation(binding, query, Math.floor(recipeIds.indexOf(id) / 2) === storeIndex ? 100 : 300)];
    }, mappings.filter(mapping => recipeIds.includes(mapping.ingredientId))).optimize(request(), stores);
    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") throw Error("Expected complete single-store baskets.");
    expect(result.total.amountCents).toBe(1400);
    expect(result.recommendedStoreId).toBe(stores[0]!.id);
    expect(result.mixedStorePlan).toMatchObject({ total: { amountCents: 600, currency: "CAD" }, savings: { comparedToStoreId: stores[0]!.id, amount: { amountCents: 800, currency: "CAD" } } });
    const larger = request(); larger.preferences.servingsPerMeal = 4; larger.preferences.mealCount = 2;
    const scaled = await service(async (binding, query) => [observation(binding, query)], mappings.filter(mapping => recipeIds.includes(mapping.ingredientId))).optimize(larger, stores);
    expect(scaled.mixedStorePlan?.lines.find(line => line.ingredientId === "chickpeas")?.packageCount).toBe(4);
    expect(scaled.mixedStorePlan?.requirements.find(item => item.ingredientId === "chickpeas")?.quantity).toBe(960);
  });
  it("enforces budgets, missing pantry oil, allergy and dietary constraints for split purchases", async () => {
    const selected = mappings.filter(mapping => recipeIds.includes(mapping.ingredientId));
    const retail = service(async (binding, query) => [observation(binding, query)], selected);
    expect((await retail.optimize(request(599), stores)).mixedStorePlan).toBeNull();
    const oilMissing = service(async (binding, query) => [observation(binding, query)], selected.filter(mapping => mapping.ingredientId !== "olive-oil"));
    expect((await oilMissing.optimize(request(), stores)).mixedStorePlan).toBeNull();
    const excluded = request(); excluded.preferences.excludedIngredientIds = ["chickpeas"];
    expect((await retail.optimize(excluded, stores)).mixedStorePlan).toBeNull();
    const allergic = request(); allergic.preferences.excludedAllergens = ["soy"]; allergic.preferences.dietaryRestrictions = ["vegan", "gluten-free"];
    const result = await retail.optimize(allergic, stores);
    expect(result.mixedStorePlan?.meals.every(meal => meal.recipeId === "chickpea-rice-bowl")).toBe(true);
  });
  it("does not claim proof after a capped meal search", async () => {
    const result = await service(async (binding, query) => [observation(binding, query)], mappings, 1).optimize(request(), stores);
    expect(result.search.exhaustive).toBe(false);
    expect(result.mixedStorePlan?.optimality).toBe("best-found");
  });
  it("covers mixed metric/US package sizes exactly without treating 500 g as one pound", () => {
    const options = [
      { product: { id: "metric", ingredientId: "rice", name: "Synthetic rice", label: "500 g", content: { quantity: 500, unit: "g" as const }, countries: ["US" as const] }, price: { amountCents: 200, currency: "USD" as const } },
      { product: { id: "us", ingredientId: "rice", name: "Synthetic rice", label: "1 lb", content: { quantity: 453.59237, unit: "g" as const }, countries: ["US" as const] }, price: { amountCents: 150, currency: "USD" as const } },
    ];
    const lines = purchasePackages("rice", { quantity: 950, unit: "g" }, options, "USD")!;
    expect(lines.reduce((sum, line) => sum + line.subtotal.amountCents, 0)).toBe(350);
    expect(lines.reduce((sum, line) => sum + line.purchased.quantity, 0)).toBeCloseTo(953.59237, 6);
    expect(lines.reduce((sum, line) => sum + line.required.quantity, 0)).toBe(950);
  });
  it("reports incomplete search when exact package enumeration is capped", async () => {
    const rice = ingredients.find(item => item.id === "rice")!;
    const recipe = { ...recipes[0]!, id: "precision-test", servings: 1, ingredients: [{ ingredientId: "rice", quantity: 1, unit: "g" as const }] };
    const engine = createPackageOptimizer("verified", { ingredients: [rice], recipes: [recipe] });
    const input = request(); input.storeIds = [stores[0]!.id]; input.preferences.dietaryRestrictions = [];
    const result = await engine(input, [stores[0]!], async () => [{ storeId: stores[0]!.id, packages: [3, 7].map(size => ({
      product: { id: `tiny-${size}`, ingredientId: "rice", name: "Synthetic precision test", label: "Synthetic", content: { quantity: size / 1_000_000, unit: "g" }, countries: ["CA"] },
      price: { amountCents: size, currency: "CAD" },
    })) }]);
    expect(result).toMatchObject({ status: "incomplete", reason: "search-limit", search: { exhaustive: false } });
  });
  it("does not let an exact SKU mapping substitute whole chicken or ordinary oats for the canonical ingredients", () => {
    for (const [id, title] of [["chicken", "Whole chicken raw"], ["chicken", "Cooked chicken breast"], ["oats", "Rolled oats"]]) {
      const original = mappings.find(mapping => mapping.ingredientId === id)!;
      const mapping = { ...original, expectedName: title! };
      const row = { ...observation(bindings[0]!, original.expectedName), name: title! };
      expect(matchVerifiedOffer(row, mapping, bindings[0]!, ingredients.find(item => item.id === id)!, now)).toBeNull();
    }
    const original = mappings.find(mapping => mapping.ingredientId === "chicken")!;
    const title = "Boneless Skinless Chicken Breast Raw";
    expect(matchVerifiedOffer({ ...observation(bindings[0]!, original.expectedName), name: title }, { ...original, expectedName: title }, bindings[0]!, ingredients.find(item => item.id === "chicken")!, now)).not.toBeNull();
  });
});
