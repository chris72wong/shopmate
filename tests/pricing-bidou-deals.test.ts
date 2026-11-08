import { describe, expect, it, vi } from "vitest";
import { createBidouDealsReader, parseBidouDeals } from "@/server/pricing/bidou-deals";

const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Synthetic rice: $2.50 at Test Grocer — −20 %</title><link>https://bidou.store/en/on/produit/synthetic</link><guid isPermaLink="false">synthetic@store@date</guid><pubDate>Sat, 07 Nov 2026 12:00:00 GMT</pubDate><description>Synthetic rice — $2.50 (reg. $3.00) at Test Grocer.</description></item></channel></rss>`;
describe("public Bidou regional RSS reader", () => {
  it("preserves actual observation dates, attribution and scope without fabricating branch or expiry", () => {
    const result = parseBidouDeals(xml, "ON", "2026-11-07T13:00:00Z");
    expect(result).toMatchObject({ country: "CA", province: "ON", basis: "advertised" });
    expect(result.deals[0]).toMatchObject({ price: { amountCents: 250, currency: "CAD" }, regularPrice: { amountCents: 300, currency: "CAD" }, retailer: "Test Grocer", providerStoreId: null, scope: "region", optimizerEligible: false, availability: "unknown", validTo: null, observedAt: "2026-11-07T12:00:00.000Z" });
    expect(result.deals[0]?.attribution).toContain("Bidou · price observed 2026-11-07");
  });
  it("refuses entity declarations and oversized/malformed input", () => {
    expect(() => parseBidouDeals(`<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///private">]>${xml}`, "ON", "2026-11-07T13:00:00Z")).toThrow();
    expect(() => parseBidouDeals("x".repeat(262145), "ON", "2026-11-07T13:00:00Z")).toThrow();
    expect(() => parseBidouDeals("not RSS", "ON", "2026-11-07T13:00:00Z")).toThrow();
  });
  it("handles escaped XML text while discarding unsafe links", () => {
    const result = parseBidouDeals(xml.replace("Synthetic rice:", "Rice &amp; beans:"), "ON", "2026-11-07T13:00:00Z");
    expect(result.deals[0]?.title).toContain("Rice & beans");
    expect(parseBidouDeals(xml.replace("https://bidou.store/en/on/produit/synthetic", "javascript:alert(1)"), "ON", "2026-11-07T13:00:00Z").deals).toEqual([]);
  });
  it("caches only a bounded feed briefly without rewriting its original retrieval date", async () => {
    let now = Date.parse("2026-11-07T13:00:00Z"); const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } }));
    const read = createBidouDealsReader(fetcher, () => now);
    const first = await read("ON"); now += 1000; const second = await read("ON");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(first.retrievedAt).toBe(second.retrievedAt);
    now += 300_000; await read("ON"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
