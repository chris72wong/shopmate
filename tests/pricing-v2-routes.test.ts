import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as catalog } from "@/app/api/v2/catalog/route";
import { POST as discover } from "@/app/api/v2/stores/route";
import { POST as pricing } from "@/app/api/v2/pricing/route";
import { POST as optimize } from "@/app/api/v2/optimize/route";
import { discoveryV2ViewSchema, pricingViewSchema, optimizationV2ViewSchema, planV2MatchesRequest } from "@/lib/planner-api";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PlanResults } from "@/components/plan-results";
import { recipes } from "@/data/recipes";
import { products } from "@/data/pricing";
import { ingredients } from "@/data/ingredients";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { jsonRequest, optimizationRequest } from "./fixtures";

describe("v2 contract and routing", () => {
  beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", ""); vi.stubEnv("REEF_KEY", ""); vi.stubEnv("SHOPMATE_PRICING_STORES", "[]"); vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", "[]"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(["CA", "US"] as const)("serves the versioned %s catalog and an explicit sample journey", async country => {
    const response = catalog(new Request(`http://localhost/api/v2/catalog?country=${country}`));
    expect(response.status).toBe(200); expect(response.headers.get("X-ShopMate-Contract-Version")).toBe("2");
    expect((await response.json()).data.catalogVersion).toBe(CATALOG_VERSION);
    const discovery = await discover(jsonRequest("/api/v2/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" } }));
    expect(discovery.status).toBe(200);
    const discovered = discoveryV2ViewSchema.parse((await discovery.json()).data);
    const stores = discovered.stores;
    const input = { ...optimizationRequest(), country, storeIds: stores.map(store => store.id), catalogVersion: CATALOG_VERSION };
    input.preferences.weeklyBudget.currency = country === "CA" ? "CAD" : "USD"; input.preferences.mealCount = 2;
    const result = await optimize(jsonRequest("/api/v2/optimize", input));
    expect(result.status).toBe(200); const body = await result.json();
    expect(body.data.status).toBe("feasible"); expect(body.data.pricingBasis).toBe("illustrative"); expect(body.data.pricing.stores).toHaveLength(3);
    expect(body.data.search.candidateRecipeIds.length).toBeGreaterThan(0); expect(body.data.search.evaluationLimit).toBe(20_000);
    expect(body.data.optimizerVersion).toBeTruthy();
    const parsed = optimizationV2ViewSchema.parse(body.data);
    expect(planV2MatchesRequest(parsed, input)).toBe(true);
    const markup = renderToStaticMarkup(createElement(PlanResults, { result: parsed, stores, ingredients, recipes, products, onEdit: () => {}, onChooseStores: () => {} }));
    expect(markup).toContain("Illustrative prices");
    expect(planV2MatchesRequest({ ...parsed, pricingBasis: "verified" }, input)).toBe(false);
    expect(planV2MatchesRequest(parsed, { ...input, catalogVersion: "stale" })).toBe(false);
  });
  it.each(["", "?country=GB", "?country=CA&country=US", "?country=CA&extra=1"])("rejects invalid catalog queries %s", query => {
    expect(catalog(new Request(`http://localhost/api/v2/catalog${query}`)).status).toBe(422);
  });
  it.each([pricing, optimize])("keeps validation/version errors in the v2 error envelope", async handler => {
    const invalid = await handler(jsonRequest("/api/v2/pricing", {})); expect(invalid.status).toBe(422); expect(invalid.headers.get("X-ShopMate-Contract-Version")).toBe("2");
    const stale = await handler(jsonRequest("/api/v2/pricing", { ...optimizationRequest(), catalogVersion: "old-catalog" }));
    expect(stale.status).toBe(422); expect((await stale.json()).ok).toBe(false);
  });
  it("rejects client-supplied offers and unknown exclusions before provider access", async () => {
    const input = { ...optimizationRequest(), catalogVersion: CATALOG_VERSION };
    expect((await optimize(jsonRequest("/api/v2/optimize", { ...input, offers: [] }))).status).toBe(422);
    input.preferences.excludedIngredientIds = ["unknown-ingredient"];
    expect((await optimize(jsonRequest("/api/v2/optimize", input))).status).toBe(422);
  });
  it("completes discovery → pricing → optimization for two physical stores using mocked provider HTTP", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "synthetic-google-key"); vi.stubEnv("REEF_KEY", "synthetic-v2-key");
    const selected = ["rice", "chickpeas", "spinach", "tomato", "olive-oil", "lemon-juice"];
    const bindings = ["loblaw", "nofrills"].map((banner, index) => ({ googlePlaceId: `synthetic-${index}`, providerId: "reef-loblaws", retailer: banner === "loblaw" ? "Loblaws" : "No Frills", country: "CA", providerStoreId: `test-${index}`, channel: "pickup", banner,
      address: { line1: `${index + 1} Synthetic Street`, city: "Test City", region: "ON", postalCode: "M5V 2T6" } }));
    const mappings = bindings.flatMap(binding => selected.map(id => {
      const item = ingredients.find(ingredient => ingredient.id === id)!;
      const net = id === "chickpeas" ? 400 : id === "rice" ? 900 : 500;
      return { providerId: binding.providerId, retailer: binding.retailer, ingredientId: id, productId: `sku-${id}`, expectedName: item.name, expectedBrand: "Synthetic Brand",
        netQuantity: { quantity: net, unit: item.unit }, usableQuantity: { quantity: id === "chickpeas" ? 240 : net, unit: item.unit },
        preparation: id === "rice" ? "dry" : id === "chickpeas" ? "drained" : "as-sold", contentEvidenceUrl: "https://example.org/synthetic-evidence" };
    }));
    vi.stubEnv("SHOPMATE_PRICING_STORES", JSON.stringify(bindings)); vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", JSON.stringify(mappings));
    const places = bindings.map(binding => ({ id: binding.googlePlaceId, displayName: { text: binding.retailer }, formattedAddress: `${binding.address.line1}, Test City, ON M5V 2T6`,
      addressComponents: [{ types: ["country"], shortText: "CA" }], location: { latitude: 0, longitude: .01 }, googleMapsUri: "https://maps.google.com/?cid=1", types: ["grocery_store"], businessStatus: "OPERATIONAL" }));
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (target, init) => {
      const url = String(target);
      if (url.startsWith("https://maps.googleapis.com/")) return Response.json({ status: "OK", results: [{ formatted_address: "Synthetic test origin", address_components: [{ short_name: "CA", types: ["country"] }, { short_name: "M5V 2T6", types: ["postal_code"] }], geometry: { location: { lat: 0, lng: 0 } } }] });
      if (url.endsWith("places:searchNearby")) return Response.json({ places });
      if (url.startsWith("https://places.googleapis.com/v1/places/")) return Response.json(places.find(place => url.endsWith(place.id)));
      const body = JSON.parse(String(init?.body)) as { banner: string; store_id: string; query: string };
      const binding = bindings.find(binding => binding.banner === body.banner)!;
      if (url.endsWith("/stores")) return Response.json({ ok: true, meta: { mode: "live" }, data: { banner: binding.banner, stores: [{ store_id: binding.providerStoreId, banner: binding.banner, address: `${binding.address.line1}, Test City`, city: "Test City", postal_code: "M5V 2T6", sells_online: true, pickup_type: "STORE" }] } });
      const mapping = mappings.find(mapping => mapping.retailer === binding.retailer && mapping.expectedName === body.query);
      return Response.json({ ok: true, meta: { mode: "live" }, data: { banner: binding.banner, store_id: binding.providerStoreId, store_defaulted: false, results: mapping ? [{ product_id: mapping.productId, title: mapping.expectedName, brand: mapping.expectedBrand, package_size: `${mapping.netQuantity.quantity} ${mapping.netQuantity.unit}`, price: binding.banner === "loblaw" ? 5 : 4, original_price: null, currency: "CAD", price_is_estimate: false, sold_by: "piece", stock_status: "in_stock", url: "https://example.org/synthetic-product" }] : [] } });
    });
    vi.stubGlobal("fetch", fetcher);
    const discovery = await discover(jsonRequest("/api/v2/stores", { mode: "live", location: { country: "CA", postalCode: "M5V 2T6" }, radiusKm: 5 }));
    expect(discovery.status).toBe(200);
    const discovered = discoveryV2ViewSchema.parse((await discovery.json()).data);
    const stores = discovered.stores;
    expect(stores.every(store => store.pricing.status === "verified-capable")).toBe(true);
    const input = { ...optimizationRequest(), mode: "live" as const, storeIds: stores.map(store => store.id), catalogVersion: CATALOG_VERSION };
    input.preferences.mealCount = 2; input.preferences.nutritionPriorities = []; input.preferences.dietaryRestrictions = [];
    const preflight = await pricing(jsonRequest("/api/v2/pricing", { mode: input.mode, country: input.country, storeIds: input.storeIds, catalogVersion: CATALOG_VERSION })); expect(preflight.status).toBe(200); expect(pricingViewSchema.safeParse((await preflight.json()).data).success).toBe(true);
    const response = await optimize(jsonRequest("/api/v2/optimize", input)); expect(response.status).toBe(200);
    const result = (await response.json()).data;
    expect(result.status).toBe("feasible"); expect(result.pricingBasis).toBe("verified"); expect(result.recommendedStoreId).toBe("google:synthetic-1");
    expect(result.total).toEqual({ amountCents: 2800, currency: "CAD" }); expect(result.basketSavings.amount.amountCents).toBe(700);
    expect(result.baskets.every((basket: { basis: string }) => basket.basis === "verified")).toBe(true);
    expect(result.pricing.stores.every((store: { offers: { provenance: { channel: string } }[] }) => store.offers.every(offer => offer.provenance.channel === "pickup"))).toBe(true);
    expect(result.search.candidateRecipeIds).toContain("chickpea-rice-bowl");
    const parsed = optimizationV2ViewSchema.parse(result);
    expect(planV2MatchesRequest(parsed, input)).toBe(true);
    const markup = renderToStaticMarkup(createElement(PlanResults, { result: parsed, stores, ingredients, recipes, products, onEdit: () => {}, onChooseStores: () => {} }));
    expect(markup).toContain("Verified branch quotes");
    expect(markup).toContain("pickup"); expect(markup).toContain("retrieved");
    expect(markup).not.toContain("Illustrative prices");
    expect(planV2MatchesRequest({ ...parsed, pricing: { ...parsed.pricing, stores: [] } }, input)).toBe(false);
    expect(result.budgetRemaining.amountCents + result.total.amountCents).toBe(input.preferences.weeklyBudget.amountCents);
  });
});
