import { describe, expect, it, vi } from "vitest";
import { ReefPricingAdapter } from "@/server/pricing/reef";
import { RetailHttp } from "@/server/pricing/retail-http";
import type { BranchBinding } from "@/server/pricing/retail-config";
import { eligiblePrice } from "@/server/pricing/normalize";

const now = Date.parse("2026-11-07T12:00:00Z");
const binding: BranchBinding = { googlePlaceId: "test", providerId: "reef-loblaws", retailer: "No Frills", country: "CA", providerStoreId: "test-branch", channel: "pickup", banner: "nofrills", address: { line1: "1 Synthetic Street", city: "Test City", region: "ON", postalCode: "M5V 2T6" } };
const row = { product_id: "synthetic-product", title: "Synthetic brown rice", brand: "Test Brand", package_size: "900 g", price: 5.5, original_price: null, currency: "CAD", price_is_estimate: false, sold_by: "piece", stock_status: "in_stock", url: "https://example.org/synthetic-product", member_price: null, deal: null, multi_buy: null };
const envelope = (data: unknown) => ({ ok: true, meta: { mode: "live", fetched_at: new Date(now).toISOString() }, data });
const search = (patch: Record<string, unknown> = {}) => envelope({ banner: "nofrills", store_id: "test-branch", store_defaulted: false, results: [row], ...patch });
function adapter(...responses: unknown[]) {
  const fetcher = vi.fn<typeof fetch>(); responses.forEach(response => fetcher.mockResolvedValueOnce(Response.json(response)));
  const http = new RetailHttp({ fetcher, now: () => now, pause: async () => {} });
  return { fetcher, instance: new ReefPricingAdapter({ apiKey: "synthetic-private-key", http }) };
}
describe("Reef adapters with synthetic upstream responses", () => {
  it("verifies the exact Canadian branch and sends its ID/banner on every price request", async () => {
    const { instance, fetcher } = adapter(envelope({ banner: "nofrills", stores: [{ store_id: "test-branch", banner: "nofrills", address: "1 Synthetic Street, Test City, ON M5V 2T6", postal_code: "M5V 2T6", city: "Test City", sells_online: true, pickup_type: "STORE" }] }), search());
    await instance.verifyBranch(binding); const result = await instance.search(binding, "brown rice");
    expect(result[0]).toMatchObject({ country: "CA", providerStoreId: "test-branch", productId: "synthetic-product", regularPrice: { amountCents: 550, currency: "CAD" }, packageQuantity: { quantity: 900, unit: "g" }, channel: "pickup", scope: "branch", availability: "available", retrievedAt: new Date(now).toISOString() });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({ store_id: "test-branch", banner: "nofrills", page_size: 12 });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-key");
  });
  it.each([{ store_defaulted: true }, { store_id: "other-branch" }, { banner: "loblaw" }])("refuses defaulted or mismatched branch data %j", async patch => {
    await expect(adapter(search(patch)).instance.search(binding, "rice")).rejects.toMatchObject({ status: 502 });
  });
  it("never accepts a branch with the wrong address or postal code", async () => {
    const { instance } = adapter(envelope({ banner: "nofrills", stores: [{ store_id: "test-branch", banner: "nofrills", address: "99 Other Street", postal_code: "M5V 2T6", city: "Test City", sells_online: true, pickup_type: "STORE" }] }));
    await expect(instance.verifyBranch(binding)).rejects.toMatchObject({ status: 502 });
  });
  it("keeps stale metadata, variable-weight estimates and unknown stock from becoming usable quotes", async () => {
    const { instance } = adapter(search({ results: [{ ...row, price_is_estimate: true, sold_by: "weight", stock_status: "unknown" }] }));
    const [result] = await instance.search(binding, "rice"); expect(result?.priceIsEstimate).toBe(true); expect(eligiblePrice(result!, now)).toBeNull();
    const stale = adapter({ ...search(), meta: { mode: "live", fetched_at: new Date(now - 600_000).toISOString() } });
    expect(eligiblePrice((await stale.instance.search(binding, "rice"))[0]!, now)).toBeNull();
  });
  it("retains Canadian unconditional discounts and loyalty prices as separate records", async () => {
    const { instance } = adapter(search({ results: [{ ...row, price: 4.5, original_price: 5.5, member_price: 3.5, deal: { type: "sale", text: "Save $1", expires: new Date(now + 60_000).toISOString() } }] }));
    const [result] = await instance.search(binding, "rice");
    expect(result?.promotions.map(promotion => promotion.type)).toEqual(["unconditional-sale", "loyalty"]);
    expect(eligiblePrice(result!, now)?.price.amountCents).toBe(450);
  });
  it("does not treat a historical was-price as a currently purchasable fallback", async () => {
    const { instance } = adapter(search({ results: [{ ...row, price: 4.5, original_price: 5.5, deal: null }] }));
    const [result] = await instance.search(binding, "rice"); expect(result?.regularPriceIsCurrent).toBe(false);
    expect(eligiblePrice(result!, now)).toBeNull();
  });
  it("checks US store echo, currency, stock and channel, and does not assume Kroger-card sale eligibility", async () => {
    const usBinding: BranchBinding = { ...binding, providerId: "reef-kroger", retailer: "Kroger", country: "US", providerStoreId: "00000001", channel: "in-store", banner: undefined, address: { ...binding.address, postalCode: "02108", region: "MA" } };
    const response = envelope({ store: { location_id: "00000001", banner_name: "Kroger", address: { lines: ["1 Synthetic Street"], country: "US", postal_code: "02108" } }, results: [{ upc: "synthetic-product", gtin14: "00036000291452", title: "Synthetic brown rice", brand: "Test Brand", size: "32 oz", currency: "USD", regular_price: 1.89, sale_price: 1.29, sale_ends_at: new Date(now + 60_000).toISOString(), price_is_estimate: false, sold_by: "Unit", stock_level: "HIGH", available_to_sell: 5, ways_to_shop: { in_store: true }, url: "https://example.org/product" }] });
    const { instance } = adapter(response); const [result] = await instance.search(usBinding, "brown rice");
    expect(result).toMatchObject({ providerId: "reef-kroger", channel: "in-store", regularPrice: { amountCents: 189, currency: "USD" }, packageQuantity: { quantity: 907.18474, unit: "g" }, availability: "available", promotionalPrice: { amountCents: 129, currency: "USD" } });
    expect(eligiblePrice(result!, now)?.price.amountCents).toBe(189);
    await expect(adapter(response).instance.search({ ...usBinding, providerStoreId: "00000002" }, "rice")).rejects.toMatchObject({ status: 502 });
  });
  it("requires an application-owned key and never embeds a playground credential", async () => {
    const instance = new ReefPricingAdapter({ apiKey: "" }); expect(instance.configured()).toBe(false);
    await expect(instance.search(binding, "rice")).rejects.toMatchObject({ status: 503 });
  });
  it("refuses provider-cached data whose original observation time is missing", async () => {
    const { instance } = adapter({ ...search(), meta: { mode: "live", cache_hit: true } });
    await expect(instance.search(binding, "rice")).rejects.toMatchObject({ status: 502 });
  });
});
describe("bounded retail transport", () => {
  it("deduplicates in-flight requests, caches briefly and preserves the original observation timestamp", async () => {
    let time = now; const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true, data: { price: 5 } }));
    const http = new RetailHttp({ fetcher, now: () => time });
    await Promise.all([http.json("same", "https://example.org/api", {}, 300_000), http.json("same", "https://example.org/api", {}, 300_000)]);
    const observed = http.observedAt("same"); time += 1000; await http.json("same", "https://example.org/api", {}, 300_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(http.observedAt("same")).toBe(observed);
    time += 300_000; await http.json("same", "https://example.org/api", {}, 300_000); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries a transient failure once, sanitizes auth/quota errors and never caches failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("private upstream payload", { status: 502 })).mockResolvedValueOnce(Response.json({ ok: true }));
    const http = new RetailHttp({ fetcher, pause: async () => {} });
    expect(await http.json("retry", "https://example.org/api", {})).toEqual({ ok: true }); expect(fetcher).toHaveBeenCalledTimes(2);
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("private", { status: 401 }));
    const auth = new RetailHttp({ fetcher: denied });
    await expect(auth.json("auth", "https://example.org/api", {})).rejects.toMatchObject({ status: 503 });
    await expect(auth.json("auth", "https://example.org/api", {})).rejects.toMatchObject({ status: 503 }); expect(denied).toHaveBeenCalledTimes(2);
    await expect(new RetailHttp({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("quota", { status: 429 })) }).json("quota", "https://example.org/api", {})).rejects.toMatchObject({ status: 429 });
  });
  it("caps retries on timeouts and does not cache failed JSON envelopes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("private URL", "TimeoutError"));
    await expect(new RetailHttp({ fetcher, pause: async () => {} }).json("timeout", "https://example.org/api", {})).rejects.toMatchObject({ status: 502 }); expect(fetcher).toHaveBeenCalledTimes(2);
    const failed = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: false, error: "private" })); const http = new RetailHttp({ fetcher: failed });
    await expect(http.json("failed", "https://example.org/api", {}, 300_000)).rejects.toMatchObject({ status: 502 });
    await expect(http.json("failed", "https://example.org/api", {}, 300_000)).rejects.toMatchObject({ status: 502 }); expect(failed).toHaveBeenCalledTimes(2);
  });
});
