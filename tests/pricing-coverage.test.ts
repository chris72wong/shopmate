import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleStore, RetailProductObservation } from "@/contracts";
import { POST as discover } from "@/app/api/v2/stores/route";
import { POST as pricingRoute } from "@/app/api/v2/pricing/route";
import { POST as optimizeRoute } from "@/app/api/v2/optimize/route";
import { ingredients } from "@/data/ingredients";
import { ServiceError } from "@/server/errors";
import type { BranchBinding, ProductMapping } from "@/server/pricing/retail-config";
import { CATALOG_VERSION, createRetailPricingService, type RetailAdapter } from "@/server/pricing/service";
import { jsonRequest, optimizationRequest } from "./fixtures";

// Wholly synthetic branch/SKU observations, never an application fallback or real price claim.
const now = Date.parse("2026-11-07T12:00:00Z");
const binding: BranchBinding = { googlePlaceId: "coverage-synthetic", providerId: "reef-loblaws", retailer: "Loblaws", country: "CA", providerStoreId: "coverage-store", channel: "pickup", banner: "loblaw", address: { line1: "1 Synthetic Street", city: "Test City", region: "ON", postalCode: "M5V 2T6" } };
const store: GoogleStore = { id: `google:${binding.googlePlaceId}`, name: "Loblaws", address: "1 Synthetic Street, Test City, ON M5V 2T6", country: "CA", chainId: "ca-loblaws", pricing: { status: "unavailable", profileId: null }, source: "google", googlePlaceId: binding.googlePlaceId, coordinates: { latitude: 0, longitude: .01 }, distanceMeters: 1112, googleMapsUri: "https://maps.google.com/?cid=1" };
const recipeIngredients = ["rice", "chickpeas", "spinach", "tomato", "olive-oil", "lemon-juice"];
const mappings: ProductMapping[] = recipeIngredients.map(id => {
  const ingredient = ingredients.find(ingredient => ingredient.id === id)!;
  return { providerId: binding.providerId, retailer: binding.retailer, ingredientId: id, productId: `coverage-${id}`, expectedName: ingredient.name, expectedBrand: "Synthetic Brand", netQuantity: { quantity: 500, unit: ingredient.unit }, usableQuantity: { quantity: id === "chickpeas" ? 240 : 500, unit: ingredient.unit }, preparation: id === "chickpeas" ? "drained" : id === "rice" ? "dry" : "as-sold", contentEvidenceUrl: "https://example.org/synthetic-content" };
});
function observation(query: string): RetailProductObservation {
  const mapping = mappings.find(mapping => mapping.expectedName === query)!;
  return { providerId: binding.providerId, retailer: binding.retailer, country: "CA", providerStoreId: binding.providerStoreId, productId: mapping.productId!, gtin: null, name: mapping.expectedName, brand: mapping.expectedBrand, category: null, packageLabel: `500 ${mapping.netQuantity.unit}`, packageQuantity: mapping.netQuantity, regularPrice: { amountCents: 100, currency: "CAD" }, regularPriceIsCurrent: true, promotionalPrice: null, promotions: [], unitPrice: null, availability: "available", channel: "pickup", scope: "branch", priceIsEstimate: false, retrievedAt: new Date(now).toISOString(), sourceObservedAt: null, providerUpdatedAt: null, expiresAt: new Date(now + 300_000).toISOString(), sourceUrl: "https://example.org/synthetic-product" };
}
function adapter(overrides: Partial<RetailAdapter> = {}): RetailAdapter {
  return { configured: () => true, verifyBranch: vi.fn<RetailAdapter["verifyBranch"]>().mockResolvedValue(), search: vi.fn<RetailAdapter["search"]>().mockImplementation(async (_binding, query) => [observation(query)]), ...overrides };
}
function request() {
  const input = optimizationRequest();
  input.mode = "live"; input.storeIds = [store.id]; input.preferences.mealCount = 1;
  return input;
}

describe("pricing preflight coverage and recoverable failures", () => {
  it("returns a structured configuration error with per-selection details and no retailer calls when credentials are missing", async () => {
    const retail = adapter({ configured: () => false });
    const service = createRetailPricingService({ adapter: retail, config: { bindings: [binding], mappings }, now: () => now });
    await expect(service.pricing("live", "CA", [store])).rejects.toMatchObject({ status: 503, error: {
      code: "provider-not-configured", message: expect.stringContaining("Ingredient prices unavailable"),
      details: [{ path: "storeIds.0", message: expect.stringContaining("Google supplies locations, not ingredient prices") }],
    } });
    expect(retail.verifyBranch).not.toHaveBeenCalled(); expect(retail.search).not.toHaveBeenCalled();
    expect(await service.storePricing(store)).toMatchObject({ status: "unavailable", profileId: null, reason: expect.stringContaining("not configured") });
  });
  it("recognizes missing product mappings as configuration failure before verifying or searching a branch", async () => {
    const retail = adapter();
    const service = createRetailPricingService({ adapter: retail, config: { bindings: [binding], mappings: [] }, now: () => now });
    await expect(service.pricing("live", "CA", [store])).rejects.toMatchObject({ status: 503, error: { code: "provider-not-configured", details: [{ path: "storeIds.0", message: expect.stringContaining("products") }] } });
    expect(await service.storePricing(store)).toMatchObject({ status: "unavailable", reason: expect.stringContaining("products") });
    expect(retail.verifyBranch).not.toHaveBeenCalled(); expect(retail.search).not.toHaveBeenCalled();
  });
  it("keeps unsupported branches explicit and supplies a no-prices notice without sample offers or totals", async () => {
    const retail = adapter();
    const service = createRetailPricingService({ adapter: retail, config: { bindings: [], mappings: [] }, now: () => now });
    const prices = await service.pricing("live", "CA", [store]);
    expect(prices.stores).toEqual([{ status: "unavailable", storeId: store.id, reason: "unsupported-store", message: expect.stringContaining("Google supplies locations, not ingredient prices") }]);
    expect(prices.notices.join(" ")).toContain("Choose other stores, retry the price check, or explicitly open the sample experience");
    expect(prices.stores[0]).not.toHaveProperty("offers"); expect(prices.stores[0]).not.toHaveProperty("total");
    expect(retail.verifyBranch).not.toHaveBeenCalled(); expect(retail.search).not.toHaveBeenCalled();
  });
  it("returns no-usable-offers after a successful empty product query, never a zero-priced basket", async () => {
    const service = createRetailPricingService({ adapter: adapter({ search: async () => [] }), config: { bindings: [binding], mappings }, now: () => now });
    const prices = await service.pricing("live", "CA", [store]);
    expect(prices.stores).toMatchObject([{ status: "unavailable", reason: "no-usable-offers" }]);
    expect(prices.notices.join(" ")).toContain("Ingredient prices unavailable");
    const result = await service.optimize(request(), [store]);
    expect(result).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", minimumKnownCost: null, search: { exhaustive: true } });
    expect(result).not.toHaveProperty("total");
  });
  it("exposes sorted missing ingredients with partial verified coverage and still permits a fully priced recipe", async () => {
    const service = createRetailPricingService({ adapter: adapter(), config: { bindings: [binding], mappings }, now: () => now });
    const prices = await service.pricing("live", "CA", [store]);
    const priced = prices.stores[0];
    expect(priced?.status).toBe("available");
    if (priced?.status !== "available" || priced.basis !== "verified") throw Error("Expected verified partial catalog coverage.");
    expect(priced.offers).toHaveLength(6);
    expect(priced.missingIngredientIds).toEqual(ingredients.map(item => item.id).filter(id => !recipeIngredients.includes(id)).sort());
    expect(prices.notices.join(" ")).toContain("Ingredient price coverage is partial");
    const result = await service.optimize(request(), [store]);
    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") throw Error("Expected a complete recipe despite partial catalog coverage.");
    expect(result.baskets).toHaveLength(1); expect(result.baskets[0]?.status).toBe("complete");
    expect(result.total).toEqual({ amountCents: 600, currency: "CAD" });
    expect(result.requirements.some(item => item.ingredientId === "olive-oil")).toBe(true);
    expect(result.pricing.stores[0]).toMatchObject({ basis: "verified", missingIngredientIds: priced.missingIngredientIds });
  });
  it("returns pricing-unavailable for a later incomplete basket without implying budget or dietary failure", async () => {
    const service = createRetailPricingService({ adapter: adapter(), config: { bindings: [binding], mappings: mappings.filter(item => item.ingredientId !== "olive-oil") }, now: () => now });
    const prices = await service.pricing("live", "CA", [store]);
    expect(prices.stores[0]).toMatchObject({ status: "available", basis: "verified", missingIngredientIds: expect.arrayContaining(["olive-oil"]) });
    const result = await service.optimize(request(), [store]);
    expect(result).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", pricingBasis: "verified", minimumKnownCost: null, search: { exhaustive: true } });
    expect(result).not.toHaveProperty("total"); expect(result).not.toHaveProperty("baskets");
  });
  it("keeps per-store unavailability alongside usable offers in requested order", async () => {
    const unsupported = { ...store, id: "google:unsupported", googlePlaceId: "unsupported" };
    const service = createRetailPricingService({ adapter: adapter(), config: { bindings: [binding], mappings }, now: () => now });
    const input = request(); input.storeIds = [unsupported.id, store.id];
    const result = await service.optimize(input, [unsupported, store]);
    expect(result.pricing.stores.map(item => item.storeId)).toEqual(input.storeIds);
    expect(result.pricing.stores[0]).toMatchObject({ status: "unavailable", reason: "unsupported-store" });
    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") throw Error("Expected the other store to support a complete basket.");
    expect(result.baskets[0]).toMatchObject({ status: "unavailable" }); expect(result.baskets[0]).not.toHaveProperty("total");
    expect(result.basketSavings).toBeNull();
  });
  it.each([[429, "rate-limited"], [502, "provider-error"]] as const)("retains HTTP %s failure details without upstream secrets", async (status, code) => {
    const service = createRetailPricingService({ adapter: adapter({ search: async () => { throw new ServiceError(status, { code, message: "private-key=synthetic-secret" }); } }), config: { bindings: [binding], mappings }, now: () => now });
    try { await service.pricing("live", "CA", [store]); throw Error("Expected provider failure."); }
    catch (error) {
      expect(error).toMatchObject({ status, error: { code, details: [{ path: "storeIds.0", message: expect.any(String) }] } });
      expect(JSON.stringify(error)).not.toContain("synthetic-secret");
    }
  });
});

describe("Google-only configuration across discovery, price check and planning routes", () => {
  beforeEach(() => { vi.stubEnv("GOOGLE_MAPS_API_KEY", "synthetic-google-secret"); vi.stubEnv("REEF_KEY", ""); vi.stubEnv("SHOPMATE_PRICING_STORES", "[]"); vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", "[]"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  function googleFetch() {
    return vi.fn<typeof fetch>().mockImplementation(async target => {
      const url = String(target);
      const place = { id: binding.googlePlaceId, displayName: { text: store.name }, formattedAddress: store.address, addressComponents: [{ types: ["country"], shortText: "CA" }], location: store.coordinates, googleMapsUri: store.googleMapsUri, types: ["grocery_store"], primaryType: "grocery_store", businessStatus: "OPERATIONAL" };
      if (url.startsWith("https://maps.googleapis.com/")) return Response.json({ status: "OK", results: [{ formatted_address: "Synthetic origin", address_components: [{ types: ["country"], short_name: "CA" }, { types: ["postal_code"], short_name: "M5V 2T6" }], geometry: { location: { lat: 0, lng: 0 } } }] });
      if (url.endsWith("places:searchNearby")) return Response.json({ places: [place] });
      if (url.startsWith("https://places.googleapis.com/v1/places/")) return Response.json(place);
      throw Error("Unexpected non-Google request; retailer calls are not configured.");
    });
  }
  it("keeps discovered locations usable while returning structured no-pricing states at preflight and final planning", async () => {
    const fetcher = googleFetch(); vi.stubGlobal("fetch", fetcher);
    const discovery = await discover(jsonRequest("/api/v2/stores", { mode: "live", location: { country: "CA", postalCode: "M5V 2T6" }, radiusKm: 5 }));
    expect(discovery.status).toBe(200);
    expect((await discovery.json()).data.stores).toMatchObject([{ id: store.id, source: "google", chainId: "ca-loblaws", pricing: { status: "unavailable", reason: expect.stringContaining("Ingredient prices unavailable") } }]);
    const input = { mode: "live", country: "CA", storeIds: [store.id], catalogVersion: CATALOG_VERSION };
    const preflight = await pricingRoute(jsonRequest("/api/v2/pricing", input));
    expect(preflight.status).toBe(200); expect(preflight.headers.get("X-ShopMate-Contract-Version")).toBe("2"); expect(preflight.headers.get("Cache-Control")).toBe("no-store");
    expect(await preflight.json()).toMatchObject({ ok: true, data: { mode: "live", stores: [{ storeId: store.id, status: "unavailable", reason: "unsupported-store" }] } });
    const response = await optimizeRoute(jsonRequest("/api/v2/optimize", { ...request(), catalogVersion: CATALOG_VERSION }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { mode: "live", status: "infeasible", reason: "pricing-unavailable", minimumKnownCost: null, pricing: { stores: [{ reason: "unsupported-store" }] } } });
    expect(body.data).not.toHaveProperty("total"); expect(JSON.stringify(body)).not.toContain("synthetic-google-secret");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("preserves the 503 error envelope with selection details when branch mappings exist but retailer credentials are missing", async () => {
    vi.stubEnv("SHOPMATE_PRICING_STORES", JSON.stringify([binding])); vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", JSON.stringify(mappings));
    vi.stubGlobal("fetch", googleFetch());
    const response = await pricingRoute(jsonRequest("/api/v2/pricing", { mode: "live", country: "CA", storeIds: [store.id], catalogVersion: CATALOG_VERSION }));
    expect(response.status).toBe(503); expect(response.headers.get("X-ShopMate-Contract-Version")).toBe("2"); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "provider-not-configured", details: [{ path: "storeIds.0", message: expect.any(String) }] } });
  });
  it("does not turn invalid optional pricing configuration into a failed Google location search", async () => {
    vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", "invalid-synthetic-config"); vi.stubGlobal("fetch", googleFetch());
    const response = await discover(jsonRequest("/api/v2/stores", { mode: "live", location: { country: "CA", postalCode: "M5V 2T6" }, radiusKm: 5 }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.stores[0].pricing).toMatchObject({ status: "unavailable", reason: expect.stringContaining("configuration") });
  });
  it.each([pricingRoute, optimizeRoute])("refuses bypassing discovery eligibility through a selected place ID", async handler => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: binding.googlePlaceId, displayName: { text: "Synthetic Independent Grocer" }, formattedAddress: store.address, addressComponents: [{ types: ["country"], shortText: "CA" }], location: store.coordinates, googleMapsUri: store.googleMapsUri, types: ["grocery_store"] })));
    const response = await handler(jsonRequest("/api/v2/pricing", { ...request(), catalogVersion: CATALOG_VERSION, ...(handler === pricingRoute ? { preferences: undefined } : {}) }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-request", details: [{ path: "storeIds", message: expect.stringContaining("Choose other stores") }] } });
  });
});
