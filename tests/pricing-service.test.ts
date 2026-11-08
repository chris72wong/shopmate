import { describe, expect, it, vi } from "vitest";
import type { RetailProductObservation } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { ServiceError } from "@/server/errors";
import { createRetailPricingService, type RetailAdapter } from "@/server/pricing/service";
import type { BranchBinding, ProductMapping } from "@/server/pricing/retail-config";
import { optimizationRequest } from "./fixtures";

const start = Date.parse("2026-11-07T12:00:00Z");
const bindings: BranchBinding[] = ["loblaw", "nofrills"].map((banner, index) => ({ googlePlaceId: `service-${index}`, providerId: "reef-loblaws", retailer: banner === "loblaw" ? "Loblaws" : "No Frills", country: "CA", providerStoreId: `test-${index}`, channel: "pickup", banner: index === 0 ? "loblaw" : "nofrills", address: { line1: `${index + 1} Synthetic Street`, city: "Test City", region: "ON", postalCode: "M5V 2T6" } }));
const stores = bindings.map(binding => ({ id: `google:${binding.googlePlaceId}`, name: binding.retailer, source: "google" as const, country: binding.country, address: `${binding.address.line1}, Test City, ON M5V 2T6`, chainId: null, pricing: { status: "unavailable" as const, profileId: null } }));
const selected = ["rice", "chickpeas", "spinach", "tomato", "olive-oil", "lemon-juice"];
const mappings: ProductMapping[] = bindings.flatMap(binding => selected.map(id => {
  const ingredient = ingredients.find(item => item.id === id)!;
  return { providerId: binding.providerId, retailer: binding.retailer, ingredientId: id, productId: `sku-${id}`, expectedName: ingredient.name, expectedBrand: "Synthetic Brand", netQuantity: { quantity: 500, unit: ingredient.unit }, usableQuantity: { quantity: id === "chickpeas" ? 240 : 500, unit: ingredient.unit }, preparation: id === "rice" ? "dry" : id === "chickpeas" ? "drained" : "as-sold", contentEvidenceUrl: "https://example.org/synthetic-content" };
}));
function quote(binding: BranchBinding, name: string, retrievedAt = start): RetailProductObservation[] {
  const mapping = mappings.find(item => item.retailer === binding.retailer && item.expectedName === name)!;
  return [{ providerId: binding.providerId, retailer: binding.retailer, country: binding.country, providerStoreId: binding.providerStoreId, productId: mapping.productId!, gtin: null, name, brand: mapping.expectedBrand, category: null, packageLabel: `500 ${mapping.netQuantity.unit}`, packageQuantity: mapping.netQuantity, regularPrice: { amountCents: 100, currency: "CAD" }, regularPriceIsCurrent: true, promotionalPrice: null, promotions: [], unitPrice: null, availability: "available", channel: binding.channel, scope: "branch", priceIsEstimate: false, retrievedAt: new Date(retrievedAt).toISOString(), sourceObservedAt: null, providerUpdatedAt: null, expiresAt: new Date(retrievedAt + 300_000).toISOString(), sourceUrl: "https://example.org/synthetic-product" }];
}
function adapter(patch: Partial<RetailAdapter> = {}): RetailAdapter {
  return { configured: () => true, verifyBranch: async () => {}, search: async (binding, query) => quote(binding, query), ...patch };
}
function request() {
  const input = optimizationRequest(); input.mode = "live"; input.storeIds = stores.map(store => store.id); input.preferences.mealCount = 2; input.preferences.nutritionPriorities = [];
  return input;
}

describe("real pricing composition and optimizer safeguards", () => {
  it("returns missing credentials without making provider requests or substituting sample offers", async () => {
    const search = vi.fn<RetailAdapter["search"]>();
    const service = createRetailPricingService({ config: { bindings, mappings }, adapter: adapter({ configured: () => false, search }), now: () => start });
    await expect(service.pricing("live", "CA", stores)).rejects.toMatchObject({ status: 503 }); expect(search).not.toHaveBeenCalled();
  });
  it("keeps unsupported branches unavailable, including a real chain with no explicit branch binding", async () => {
    const service = createRetailPricingService({ config: { bindings: [], mappings }, adapter: adapter(), now: () => start });
    const result = await service.optimize(request(), stores);
    expect(result).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", pricingBasis: "verified", search: { exhaustive: true } });
    expect(result.pricing.stores.every(store => store.status === "unavailable")).toBe(true);
  });
  it("allows one complete branch to plan while retaining the other failure without a total or savings", async () => {
    const service = createRetailPricingService({ config: { bindings, mappings }, adapter: adapter({ verifyBranch: async binding => { if (binding.providerStoreId === "test-1") throw new ServiceError(429, { code: "rate-limited", message: "Synthetic quota" }); } }), now: () => start });
    const result = await service.optimize(request(), stores); expect(result.status).toBe("feasible");
    if (result.status !== "feasible") throw Error("Expected a complete first branch.");
    expect(result.baskets[0]?.status).toBe("complete"); expect(result.baskets[1]?.status).toBe("unavailable");
    expect(result.baskets[1]).not.toHaveProperty("total"); expect(result.basketSavings).toBeNull();
    expect(result.pricing.stores[1]).toMatchObject({ status: "unavailable", reason: "rate-limited" });
  });
  it("never treats a partially priced basket as comparable when pantry oil is missing", async () => {
    const withoutOil = mappings.filter(mapping => mapping.ingredientId !== "olive-oil");
    const service = createRetailPricingService({ config: { bindings, mappings: withoutOil }, adapter: adapter(), now: () => start });
    expect(await service.optimize(request(), stores)).toMatchObject({ status: "infeasible", reason: "pricing-unavailable", pricingBasis: "verified" });
  });
  it("rejects wrong-currency products rather than converting or using demo prices", async () => {
    const service = createRetailPricingService({ config: { bindings, mappings }, adapter: adapter({ search: async (binding, query) => quote(binding, query).map(item => ({ ...item, regularPrice: { amountCents: 100, currency: "USD" } })) }), now: () => start });
    const result = await service.pricing("live", "CA", stores); expect(result.stores.every(store => store.status === "unavailable")).toBe(true);
  });
  it("rechecks all branch expiries at the common completion time", async () => {
    let now = start;
    const service = createRetailPricingService({ config: { bindings, mappings }, adapter: adapter({ search: async (binding, query) => {
      if (binding.providerStoreId === "test-1") now = start + 2000;
      return quote(binding, query, now).map(item => ({ ...item, expiresAt: new Date(now + 1000).toISOString() }));
    } }), now: () => now });
    const result = await service.pricing("live", "CA", stores);
    expect(result.stores[0]).toMatchObject({ status: "unavailable", reason: "no-usable-offers" }); expect(result.stores[1]?.status).toBe("available");
  });
  it("preserves incomplete-search semantics with a small evaluation cap", async () => {
    const service = createRetailPricingService({ config: { bindings, mappings }, adapter: adapter(), now: () => start, engineOptions: { evaluationLimit: 1 } });
    const input = request(); input.preferences.weeklyBudget.amountCents = 1;
    expect(await service.optimize(input, stores)).toMatchObject({ status: "incomplete", reason: "search-limit", search: { exhaustive: false, evaluationLimit: 1 } });
  });
});
