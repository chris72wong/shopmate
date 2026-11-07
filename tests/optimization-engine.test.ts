import { describe, expect, it, vi } from "vitest";
import type { BasketLine, Country, Ingredient, OptimizationRequest, ProductPackage, Recipe } from "@/contracts";
import { ingredients as catalogIngredients } from "@/data/ingredients";
import { getDemoStores } from "@/data/demo-stores";
import { aggregateRequirements, createOptimizationEngine } from "@/server/optimization/engine";
import { purchasePackages } from "@/server/optimization/packages";
import type { GroceryPricingProvider } from "@/server/pricing/provider";

const ingredients = catalogIngredients.filter(item => ["rice", "olive-oil", "milk", "peanut-butter"].includes(item.id));
const recipe = (id: string, amounts: [string, number][], diets: Recipe["diets"] = ["vegetarian", "vegan", "gluten-free"]): Recipe => ({ id, name: id, description: "Synthetic recipe only", servings: 2, totalMinutes: 10,
  ingredients: amounts.map(([ingredientId, quantity]) => ({ ingredientId, quantity, unit: ingredients.find(item => item.id === ingredientId)!.unit })),
  diets, allergens: [], steps: [], illustration: "grain-bowl", nutritionBasis: "estimated", nutritionPerServing: { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 } });
function product(ingredientId: string, content: number, id = `pkg-${ingredientId}`): ProductPackage {
  return { id, ingredientId, name: id, label: "Synthetic package only", content: { quantity: content, unit: ingredients.find(item => item.id === ingredientId)!.unit }, countries: ["CA", "US"] };
}
function request(country: Country = "CA"): OptimizationRequest {
  return { mode: "demo", country, storeIds: [getDemoStores(country)[0]!.id], preferences: { weeklyBudget: { amountCents: 400, currency: country === "CA" ? "CAD" : "USD" }, mealCount: 2, servingsPerMeal: 2,
    dietaryRestrictions: [], excludedIngredientIds: [], excludedAllergens: [], nutritionPriorities: [], objective: "minimize-cost" } };
}
const rice = product("rice", 240); const oil = product("olive-oil", 500);
const simpleRecipe = recipe("rice-oil", [["rice", 120], ["olive-oil", 15]]);
function pricing(packages: ProductPackage[] = [rice, oil], cents: Record<string, number> = { "pkg-rice": 101, "pkg-olive-oil": 299 }): GroceryPricingProvider {
  return { getOffers: vi.fn(async store => ({ status: "available" as const, storeId: store.id, basis: "illustrative" as const, offers: packages.filter(item => cents[item.id] !== undefined).map(item => ({
    productId: item.id, profileId: store.pricing.profileId!, available: true, basis: "illustrative" as const,
    price: { amountCents: cents[item.id]!, currency: store.country === "CA" ? "CAD" as const : "USD" as const },
  })) })) };
}
const create = (recipes: Recipe[] = [simpleRecipe], products = [rice, oil], evaluationLimit?: number) => createOptimizationEngine({ ingredients, recipes, products, evaluationLimit });

describe("package purchase arithmetic", () => {
  it("combines before rounding, includes pantry oil and buys full packages", async () => {
    const input = request(); const provider = pricing();
    const result = await create().optimize(input, getDemoStores("CA").slice(0, 1), provider);
    expect(result.status).toBe("feasible"); if (result.status !== "feasible") throw Error("No plan");
    expect(provider.getOffers).toHaveBeenCalledTimes(1);
    expect(result.total.amountCents).toBe(400); expect(result.budgetRemaining.amountCents).toBe(0);
    expect(result.requirements).toEqual([{ ingredientId: "olive-oil", quantity: 30, unit: "ml", usedByRecipeIds: ["rice-oil"] }, { ingredientId: "rice", quantity: 240, unit: "g", usedByRecipeIds: ["rice-oil"] }]);
    const basket = result.baskets[0]!; if (basket.status !== "complete") throw Error("Incomplete basket");
    expect(basket.lines.find(line => line.ingredientId === "rice")).toMatchObject({ packageCount: 1, purchased: { quantity: 240 }, leftover: { quantity: 0 } });
    expect(basket.lines.find(line => line.ingredientId === "olive-oil")).toMatchObject({ packageCount: 1, purchased: { quantity: 500, unit: "ml" }, leftover: { quantity: 470, unit: "ml" } });
    expect(result.ingredientReuse.map(item => item.estimatedSavings.amountCents)).toEqual([299, 101]);
    expect(result.ingredientReuse.every(item => item.packagesAvoided === 1)).toBe(true);
    expect(result.meals.map(meal => meal.slot)).toEqual([0, 1]); expect(result.search).toEqual({ evaluatedCombinations: 1, exhaustive: true });
    expect(result.optimality).toBe("proven"); expect(result.basketSavings).toBeNull();
  });
  it("enforces the exact cent budget boundary and reports a full-package minimum", async () => {
    const input = request(); input.preferences.weeklyBudget.amountCents = 399;
    const result = await create().optimize(input, getDemoStores("CA").slice(0, 1), pricing());
    expect(result).toMatchObject({ status: "infeasible", reason: "budget", minimumKnownCost: { amountCents: 400, currency: "CAD" }, search: { exhaustive: true } });
  });
  it("scales full recipe yields and retains unique references across repeated slots", () => {
    expect(aggregateRequirements([simpleRecipe, simpleRecipe], 3)).toEqual([
      { ingredientId: "olive-oil", quantity: 45, unit: "ml", usedByRecipeIds: [simpleRecipe.id] }, { ingredientId: "rice", quantity: 360, unit: "g", usedByRecipeIds: [simpleRecipe.id] },
    ]);
  });
  it("uses drained/usable contents and never assumes that millilitres equal grams", () => {
    const drained = product("rice", 240, "synthetic-drained-test");
    expect(purchasePackages("rice", { quantity: 241, unit: "g" }, [{ product: drained, price: { amountCents: 129, currency: "CAD" } }], "CAD")?.[0]?.packageCount).toBe(2);
    expect(purchasePackages("olive-oil", { quantity: 15, unit: "ml" }, [{ product: { ...oil, content: { quantity: 500, unit: "g" } }, price: { amountCents: 299, currency: "CAD" } }], "CAD")).toBeNull();
  });
  it("finds the cheapest covering mixture of package sizes rather than greedy unit pricing", () => {
    const packages = [ { product: product("rice", 500, "small"), price: { amountCents: 70, currency: "CAD" as const } }, { product: product("rice", 1000, "large"), price: { amountCents: 120, currency: "CAD" as const } } ];
    const lines = purchasePackages("rice", { quantity: 1200, unit: "g" }, packages, "CAD")!;
    expect(lines.reduce((sum, line) => sum + line.subtotal.amountCents, 0)).toBe(190);
    expect(lines.reduce((sum, line) => sum + line.required.quantity, 0)).toBe(1200);
    expect(lines.every(line => line.purchased.quantity === line.required.quantity + line.leftover.quantity)).toBe(true);
    expect(purchasePackages("rice", { quantity: 1000, unit: "g" }, packages, "CAD")?.reduce((sum, line) => sum + line.subtotal.amountCents, 0)).toBe(120);
    const fractional = { product: product("rice", .3), price: { amountCents: 1, currency: "CAD" as const } };
    expect(purchasePackages("rice", { quantity: .1 + .2, unit: "g" }, [fractional], "CAD")?.[0]?.packageCount).toBe(1);
  });
  it("matches exhaustive brute-force package costs over a range of requirements", () => {
    const packs = [ { product: product("rice", 3, "three"), price: { amountCents: 4, currency: "CAD" as const } }, { product: product("rice", 5, "five"), price: { amountCents: 6, currency: "CAD" as const } } ];
    for (let quantity = 1; quantity <= 30; quantity++) {
      let minimum = Infinity;
      for (let a = 0; a <= 11; a++) for (let b = 0; b <= 7; b++) if (a * 3 + b * 5 >= quantity) minimum = Math.min(minimum, a * 4 + b * 6);
      expect(purchasePackages("rice", { quantity, unit: "g" }, packs, "CAD")!.reduce((sum, line) => sum + line.subtotal.amountCents, 0)).toBe(minimum);
    }
  });
});
describe("constraints, pricing and country boundaries", () => {
  it("excludes known ingredients and allergens as hard constraints, even without recipe tags", async () => {
    const milk = product("milk", 1000); const peanut = product("peanut-butter", 500);
    const recipes = [recipe("with-milk", [["milk", 20]], ["vegetarian"]), recipe("with-peanut", [["peanut-butter", 20]])];
    const input = request(); input.preferences.excludedAllergens = ["milk"]; input.preferences.excludedIngredientIds = ["peanut-butter"];
    const provider = pricing([milk, peanut], { [milk.id]: 100, [peanut.id]: 100 });
    expect(await create(recipes, [milk, peanut]).optimize(input, getDemoStores("CA").slice(0, 1), provider)).toMatchObject({ status: "infeasible", reason: "dietary-constraints", search: { exhaustive: true, evaluatedCombinations: 0 } });
    expect(provider.getOffers).not.toHaveBeenCalled();
  });
  it("enforces all diets and rejects unknown IDs before provider calls", async () => {
    const input = request(); input.preferences.excludedIngredientIds = ["unknown-ingredient"];
    const provider = pricing();
    await expect(create().optimize(input, getDemoStores("CA").slice(0, 1), provider)).rejects.toMatchObject({ status: 422 });
    expect(provider.getOffers).not.toHaveBeenCalled();
    input.preferences.excludedIngredientIds = []; input.preferences.dietaryRestrictions = ["vegan", "gluten-free"];
    expect((await create().optimize(input, getDemoStores("CA").slice(0, 1), provider)).status).toBe("feasible");
  });
  it("keeps missing pantry prices unavailable rather than treating them as free", async () => {
    const result = await create().optimize(request(), getDemoStores("CA").slice(0, 1), pricing([rice]));
    expect(result).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", minimumKnownCost: null, search: { exhaustive: true } });
  });
  it("compares complete identical baskets, leaves incomplete totals absent and breaks store ties by ID", async () => {
    const input = request(); const stores = getDemoStores("CA"); input.storeIds = stores.map(store => store.id);
    const provider: GroceryPricingProvider = { async getOffers(store) {
      return pricing(store.id.includes("orchard") ? [rice] : [rice, oil], { [rice.id]: store.id.includes("cedar") ? 110 : 101, [oil.id]: 299 }).getOffers(store, []);
    } };
    const result = await create().optimize(input, stores, provider);
    if (result.status !== "feasible") throw Error("No plan");
    expect(result.recommendedStoreId).toBe("demo-ca-clover"); expect(result.basketSavings?.amount.amountCents).toBe(9);
    expect(result.baskets.find(item => item.storeId.includes("orchard"))).toEqual({ status: "unavailable", storeId: "demo-ca-orchard", missingIngredientIds: ["olive-oil"], reason: expect.any(String) });
    expect(result.baskets.find(item => item.status === "unavailable")).not.toHaveProperty("total");
    const tied = await create().optimize(input, [...stores].reverse(), pricing());
    expect(tied.status === "feasible" && tied.recommendedStoreId).toBe("demo-ca-cedar");
  });
  it.each(["CA", "US"] as const)("preserves %s currencies and rejects currency/mode/store mismatches", async country => {
    const input = request(country); const stores = getDemoStores(country).slice(0, 1);
    const result = await create().optimize(input, stores, pricing());
    expect(result.currency).toBe(country === "CA" ? "CAD" : "USD");
    input.preferences.weeklyBudget.currency = country === "CA" ? "USD" : "CAD";
    await expect(create().optimize(input, stores, pricing())).rejects.toMatchObject({ status: 422 });
    await expect(create().optimize(request(country), getDemoStores(country === "CA" ? "US" : "CA").slice(0, 1), pricing())).rejects.toMatchObject({ status: 422 });
  });
  it("never compares a wrong-currency or wrong-profile offer", async () => {
    const provider: GroceryPricingProvider = { async getOffers(store, ids) {
      const result = await pricing().getOffers(store, ids);
      if (result.status === "available") result.offers = result.offers.map(offer => ({ ...offer, price: { ...offer.price, currency: "USD" } }));
      return result;
    } };
    expect(await create().optimize(request(), getDemoStores("CA").slice(0, 1), provider)).toMatchObject({ status: "infeasible", reason: "pricing-unavailable" });
  });
});
describe("search, ranking and estimates", () => {
  it("exhausts every recipe multiset including repeats, with deterministic output", async () => {
    const recipes = [recipe("c", [["rice", 90]]), recipe("a", [["rice", 110]]), recipe("b", [["rice", 100]])];
    const first = await create(recipes, [rice]).optimize(request(), getDemoStores("CA").slice(0, 1), pricing([rice]));
    const second = await create([...recipes].reverse(), [rice]).optimize(request(), getDemoStores("CA").slice(0, 1), pricing([rice]));
    expect(first).toEqual(second); expect(first.search).toEqual({ evaluatedCombinations: 6, exhaustive: true });
  });
  it("returns best-found after truncation, and incomplete rather than false infeasibility", async () => {
    const recipes = [recipe("a", [["rice", 120]]), recipe("b", [["rice", 10]])];
    const engine = create(recipes, [rice], 1); const stores = getDemoStores("CA").slice(0, 1);
    expect(await engine.optimize(request(), stores, pricing([rice]))).toMatchObject({ status: "feasible", optimality: "best-found", search: { exhaustive: false, evaluatedCombinations: 1 } });
    const input = request(); input.preferences.weeklyBudget.amountCents = 1;
    expect(await engine.optimize(input, stores, pricing([rice]))).toMatchObject({ status: "incomplete", reason: "search-limit", search: { exhaustive: false } });
  });
  it("keeps high protein a soft preference; derives nutrition from consumed quantities", async () => {
    const input = request(); input.preferences.nutritionPriorities = ["high-protein"];
    const result = await create().optimize(input, getDemoStores("CA").slice(0, 1), pricing());
    if (result.status !== "feasible") throw Error("No plan");
    const riceIngredient = ingredients.find(item => item.id === "rice")!;
    expect(result.estimatedTotalNutrition.proteinG).toBe(Math.round(riceIngredient.nutrition.values.proteinG * 240 / 100 * 10) / 10);
    expect(result.estimatedTotalNutrition.fatG).toBeLessThan(100); // 30 ml consumed, not the purchased 500 ml.
    expect(result.notices.join(" ")).toContain("sample estimates");
  });
  it("prefers more protein when cost is tied, with no hard threshold", async () => {
    const input = request(); input.preferences.objective = "maximize-nutrition"; input.preferences.nutritionPriorities = ["high-protein"];
    const peanut = product("peanut-butter", 500);
    const result = await create([recipe("a-rice", [["rice", 10]]), recipe("b-peanut", [["peanut-butter", 80]])], [rice, peanut])
      .optimize(input, getDemoStores("CA").slice(0, 1), pricing([rice, peanut], { [rice.id]: 100, [peanut.id]: 100 }));
    expect(result.status === "feasible" && result.meals.every(meal => meal.recipeId === "b-peanut")).toBe(true);
  });
  it("rejects incompatible catalog ingredient units rather than converting density", () => {
    const bad = { ...simpleRecipe, ingredients: [{ ingredientId: "rice", quantity: 10, unit: "ml" as const }] };
    expect(() => aggregateRequirements([simpleRecipe, bad], 2)).toThrow("Incompatible");
  });
  it("checks package-line money and quantity identities", async () => {
    const result = await create().optimize(request(), getDemoStores("CA").slice(0, 1), pricing());
    if (result.status !== "feasible") throw Error("No plan");
    const lines: BasketLine[] = result.baskets.flatMap(basket => basket.status === "complete" ? basket.lines : []);
    for (const line of lines) { expect(line.subtotal.amountCents).toBe(line.packageCount * line.unitPrice.amountCents); expect(line.purchased.quantity).toBe(line.required.quantity + line.leftover.quantity); }
    expect(result.total.amountCents + result.budgetRemaining.amountCents).toBe(request().preferences.weeklyBudget.amountCents);
  });
  it("validates ingredient diet metadata even when recipe metadata is inaccurate", async () => {
    const milk: Ingredient = ingredients.find(item => item.id === "milk")!;
    const input = request(); input.preferences.dietaryRestrictions = ["vegan"];
    const result = await create([recipe("mislabelled", [[milk.id, 10]])], [product("milk", 100)])
      .optimize(input, getDemoStores("CA").slice(0, 1), pricing());
    expect(result).toMatchObject({ status: "infeasible", reason: "dietary-constraints" });
  });
});
