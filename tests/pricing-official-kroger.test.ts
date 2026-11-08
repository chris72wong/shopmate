import { afterEach, describe, expect, it, vi } from "vitest";
import { ingredients } from "@/data/ingredients";
import { KrogerPricingAdapter } from "@/server/pricing/kroger";
import { RetailHttp } from "@/server/pricing/retail-http";
import { createRetailPricingService } from "@/server/pricing/service";
import type { BranchBinding, ProductMapping } from "@/server/pricing/retail-config";
import { branchBindingSchema, productMappingSchema } from "@/server/pricing/retail-config";
import { optimizationRequest } from "./fixtures";
import { optimizationV2ViewSchema, planV2MatchesRequest, pricingViewSchema } from "@/lib/planner-api";

// Entirely synthetic upstream rows. None are live observations or application configuration.
const start = Date.parse("2026-11-07T12:00:00Z");
const binding: BranchBinding = { googlePlaceId: "official-synthetic", providerId: "kroger", retailer: "Kroger", country: "US", providerStoreId: "00000001", channel: "in-store",
  address: { line1: "1 Synthetic Street", city: "Test City", region: "OH", postalCode: "45202" } };
const location = { locationId: binding.providerStoreId, chain: "Kroger", address: { addressLine1: binding.address.line1, city: binding.address.city, state: "OH", zipCode: "45202" } };
const store = { id: `google:${binding.googlePlaceId}`, name: "Kroger", address: "1 Synthetic Street, Test City, OH 45202, USA", source: "google" as const, country: "US" as const, chainId: "us-kroger" as const, pricing: { status: "unavailable" as const, profileId: null } };
const ids = ["rice", "chickpeas", "spinach", "tomato", "olive-oil", "lemon-juice"];
const mappings: ProductMapping[] = ids.map((id, index) => {
  const ingredient = ingredients.find(item => item.id === id)!;
  return { providerId: "kroger", retailer: "Kroger", ingredientId: id, productId: `0000000${index + 1}`, expectedName: `Synthetic ${id}`, expectedBrand: "Synthetic Brand",
    netQuantity: { quantity: 500, unit: ingredient.unit }, usableQuantity: { quantity: id === "chickpeas" ? 240 : 500, unit: ingredient.unit },
    preparation: id === "rice" ? "dry" : id === "chickpeas" ? "drained" : "as-sold", contentEvidenceUrl: "https://example.org/synthetic-review" };
});
const product = (mapping = mappings[0]!) => ({ productId: mapping.productId!, upc: "00011110898746", description: mapping.expectedName, brand: mapping.expectedBrand, categories: ["Synthetic category"],
  productPageURI: "/p/synthetic-product/00000001", items: [{ itemId: "0001", size: `500 ${mapping.netQuantity.unit}`, soldBy: "UNIT", price: { regular: 2.99, promo: 1.99 }, inventory: { stockLevel: "HIGH" }, fulfillment: { inStore: true } }] });
let clientNumber = 0;
function setup(patch?: (url: URL) => Response | undefined) {
  let now = start;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (target) => {
    const url = new URL(String(target));
    const override = patch?.(url); if (override) return override;
    if (url.pathname.endsWith("/token")) return Response.json({ access_token: "synthetic-token", token_type: "bearer", expires_in: 1800 });
    if (url.pathname.endsWith("/locations")) return Response.json({ data: [location] });
    if (url.pathname.includes("/locations/")) return Response.json({ data: location });
    if (url.pathname.endsWith("/products")) return Response.json({ data: [product()] });
    const mapping = mappings.find(mapping => url.pathname.endsWith(mapping.productId!));
    return mapping ? Response.json({ data: product(mapping) }) : new Response(null, { status: 404 });
  });
  const adapter = new KrogerPricingAdapter({ clientId: `synthetic-client-${++clientNumber}`, clientSecret: "synthetic-secret", now: () => now,
    http: new RetailHttp({ fetcher, now: () => now, pause: async () => {} }) });
  return { adapter, fetcher, advance: (milliseconds: number) => { now += milliseconds; } };
}
afterEach(() => vi.unstubAllEnvs());

describe("official Kroger production adapter", () => {
  it("validates actual provider ID formats before making paid requests", () => {
    expect(branchBindingSchema.safeParse(binding).success).toBe(true);
    expect(branchBindingSchema.safeParse({ ...binding, providerStoreId: "guessed-branch" }).success).toBe(false);
    expect(productMappingSchema.safeParse(mappings[0]).success).toBe(true);
    expect(productMappingSchema.safeParse({ ...mappings[0], productId: "guessed-sku" }).success).toBe(false);
  });
  it("uses client-credentials OAuth, reuses the token and retrieves current location-filtered products", async () => {
    const { adapter, fetcher } = setup();
    await adapter.verifyBranch(binding);
    const observations = await adapter.search(binding, "brown rice");
    await adapter.lookup(binding, mappings[0]!.productId!);
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith("/token"))).toHaveLength(1);
    const oauth = fetcher.mock.calls[0]![1]!;
    expect(new URLSearchParams(String(oauth.body)).get("scope")).toBe("product.compact");
    const searchUrl = new URL(String(fetcher.mock.calls[2]![0]));
    expect(searchUrl.searchParams.get("filter.locationId")).toBe(binding.providerStoreId);
    expect(searchUrl.searchParams.get("filter.fulfillment")).toBe("ais");
    expect(searchUrl.searchParams.get("filter.limit")).toBe("20");
    expect(observations[0]).toMatchObject({ providerId: "kroger", providerStoreId: binding.providerStoreId, regularPrice: { amountCents: 299, currency: "USD" },
      promotionalPrice: { amountCents: 199, currency: "USD" }, availability: "available", priceIsEstimate: false, packageQuantity: { quantity: 500, unit: "g" }, retrievedAt: new Date(start).toISOString() });
    expect(observations[0]?.promotions[0]).toMatchObject({ type: "loyalty", membershipRequired: true });
    expect(JSON.stringify(observations)).not.toMatch(/synthetic-secret|synthetic-token/);
    expect(fetcher.mock.calls.every(call => call[1]?.cache === "no-store" && call[1]?.redirect === "error")).toBe(true);
  });
  it("resolves the actual retailer location from exact banner/street/city/state/ZIP agreement", async () => {
    const { adapter } = setup();
    expect(await adapter.resolveBranch(store)).toEqual(binding);
    expect(await adapter.resolveBranch({ ...store, name: "Ralphs" })).toBeUndefined();
    expect(await adapter.resolveBranch({ ...store, address: "2 Synthetic Street, Test City, OH 45202, USA" })).toBeUndefined();
    expect(await adapter.resolveBranch({ ...store, address: "1 Synthetic Street, Other City, OH 45202, USA" })).toBeUndefined();
    expect(await adapter.resolveBranch({ ...store, address: "1 Synthetic Street, Test City, KY 45202, USA" })).toBeUndefined();
  });
  it("refuses ambiguous locations and a provider branch with a changed identity", async () => {
    const { adapter } = setup(url => url.pathname.endsWith("/locations") ? Response.json({ data: [location, { ...location, locationId: "00000002" }] }) : undefined);
    expect(await adapter.resolveBranch(store)).toBeUndefined();
    await expect(adapter.verifyBranch({ ...binding, address: { ...binding.address, line1: "2 Synthetic Street" } })).rejects.toMatchObject({ status: 502 });
  });
  it("does not query unsupported banners or Canadian stores", async () => {
    const { adapter, fetcher } = setup();
    expect(await adapter.resolveBranch({ ...store, name: "Walmart" })).toBeUndefined();
    expect(await adapter.resolveBranch({ ...store, country: "CA", name: "Loblaws" })).toBeUndefined();
    await expect(adapter.search({ ...binding, country: "CA" }, "rice")).rejects.toMatchObject({ status: 502 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires credentials before querying and sanitizes authentication/quota failures", async () => {
    const adapter = new KrogerPricingAdapter({ clientId: "", clientSecret: "" });
    await expect(adapter.resolveBranch(store)).rejects.toMatchObject({ status: 503, error: { code: "provider-not-configured" } });
    for (const status of [401, 403, 429]) {
      const { adapter } = setup(() => new Response("synthetic-secret", { status }));
      await expect(adapter.verifyBranch(binding)).rejects.toMatchObject({ status: status === 429 ? 429 : 503 });
    }
  });
  it("refreshes expired OAuth tokens and does not cache a prior product price", async () => {
    const { adapter, advance, fetcher } = setup();
    await adapter.lookup(binding, mappings[0]!.productId!);
    advance(1_800_000);
    await adapter.lookup(binding, mappings[0]!.productId!);
    expect(fetcher.mock.calls.filter(call => String(call[0]).endsWith("/token"))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(call => String(call[0]).includes("/products/"))).toHaveLength(2);
  });
  it.each([
    { soldBy: "WEIGHT", inventory: { stockLevel: "HIGH" }, fulfillment: { inStore: true }, expected: "available", estimate: true },
    { soldBy: "UNIT", inventory: { stockLevel: "TEMPORARILY_OUT_OF_STOCK" }, fulfillment: { inStore: true }, expected: "unavailable", estimate: false },
    { soldBy: "UNIT", inventory: {}, fulfillment: { inStore: true }, expected: "unknown", estimate: false },
    { soldBy: "UNIT", inventory: { stockLevel: "HIGH" }, fulfillment: {}, expected: "unknown", estimate: false },
  ])("preserves variable-weight or missing stock/channel evidence as ineligible: $expected/$estimate", async row => {
    const { adapter } = setup(url => url.pathname.includes("/products/") ? Response.json({ data: { ...product(), items: [{ ...product().items[0], ...row, size: "32 oz" }] } }) : undefined);
    const result = await adapter.lookup(binding, mappings[0]!.productId!);
    expect(result[0]).toMatchObject({ availability: row.expected, priceIsEstimate: row.estimate, packageQuantity: { quantity: 907.18474, unit: "g" } });
  });
  it("connects automatic branch mapping, exact product lookup and complete whole-package planning", async () => {
    const { adapter } = setup();
    const service = createRetailPricingService({ config: { bindings: [], mappings }, adapters: { kroger: adapter }, now: () => start });
    const input = { ...optimizationRequest(), mode: "live" as const, country: "US" as const, storeIds: [store.id] };
    input.preferences = { ...input.preferences, mealCount: 1, servingsPerMeal: 2, objective: "minimize-cost", nutritionPriorities: [], weeklyBudget: { amountCents: 1794, currency: "USD" } };
    const result = await service.optimize(input, [store]);
    expect(result).toMatchObject({ status: "feasible", pricingBasis: "verified", total: { amountCents: 1794, currency: "USD" } });
    if (result.status !== "feasible") throw Error("Expected complete synthetic branch pricing.");
    expect(result.meals[0]?.recipeId).toBe("chickpea-rice-bowl");
    expect(result.budgetRemaining.amountCents).toBe(0);
    expect(result.pricing.stores[0]).toMatchObject({ basis: "verified", offers: expect.arrayContaining([expect.objectContaining({ provenance: expect.objectContaining({ providerId: "kroger" }) })]) });
    expect(result.mixedStorePlan?.total).toEqual(result.total);
    for (const quote of result.pricing.stores) if (quote.status === "available" && quote.basis === "verified") {
      for (const offer of quote.offers) expect(offer.observation).not.toHaveProperty("data");
    }
    const browserResult = optimizationV2ViewSchema.parse(result);
    expect(pricingViewSchema.parse(result.pricing).stores[0]).toMatchObject({ status: "available", basis: "verified" });
    expect(planV2MatchesRequest(browserResult, { ...input, catalogVersion: result.catalogVersion })).toBe(true);
  });
  it("requires reviewed usable-content mappings instead of converting arbitrary search results into ingredients", async () => {
    const { adapter } = setup();
    const service = createRetailPricingService({ config: { bindings: [], mappings: [] }, adapters: { kroger: adapter }, now: () => start });
    await expect(service.pricing("live", "US", [store])).rejects.toMatchObject({ status: 503, error: { details: [{ path: "storeIds.0", message: expect.stringContaining("products") }] } });
  });
});
