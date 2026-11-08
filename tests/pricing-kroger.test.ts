import { describe, expect, it, vi } from "vitest";
import { probeKrogerPricing } from "@/server/pricing/kroger-probe";

const input = { country: "US" as const, postalCode: "02108", term: "oats" };
const branch = { locationId: "000001", name: "Synthetic branch", address: { addressLine1: "Synthetic address", city: "Synthetic city", state: "AA", zipCode: "02108" } };
const config = { clientId: "synthetic-client", clientSecret: "synthetic-secret" };
describe("isolated Kroger access investigation", () => {
  it("requires credentials and refuses Canadian searches before sending any request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(probeKrogerPricing(input, { clientId: "", clientSecret: "", fetcher })).rejects.toMatchObject({ status: 503 });
    await expect(probeKrogerPricing({ ...input, country: "CA", postalCode: "M5V 2T6" }, { ...config, fetcher })).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requests a bounded authenticated branch/product probe without promoting observations to verified packages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "synthetic-token" }))
      .mockResolvedValueOnce(Response.json({ data: [branch] }))
      .mockResolvedValueOnce(Response.json({ data: [{ productId: "sku", description: "Synthetic oats", items: [{ itemId: "item", size: "1 lb", price: { regular: 1.99, promo: .99 }, inventory: { stockLevel: "HIGH" } }] }] }));
    const result = await probeKrogerPricing(input, { ...config, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get("filter.zipCode.near")).toBe("02108");
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.get("filter.locationId")).toBe(branch.locationId);
    expect(result.products[0]).toMatchObject({ regularPrice: { amountCents: 199, currency: "USD" }, packageLabel: "1 lb", optimizerReady: false });
    expect(result.products[0]).not.toHaveProperty("content");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|synthetic-token/);
    expect(fetcher.mock.calls.every(call => call[1]?.cache === "no-store" && call[1]?.redirect === "error")).toBe(true);
  });
  it("preserves missing and unsupported fractional-cent prices as unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "token" })).mockResolvedValueOnce(Response.json({ data: [branch] }))
      .mockResolvedValueOnce(Response.json({ data: [{ productId: "sku", description: "Test", items: [{ itemId: "missing" }, { itemId: "fraction", price: { regular: 1.999 } }, { itemId: "zero", price: { regular: 0 } }] }] }));
    const result = await probeKrogerPricing(input, { ...config, fetcher });
    expect(result.products.map(item => item.regularPrice)).toEqual([null, null, null]);
  });
  it("does not manufacture branch/product data after an empty retailer search", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "token" })).mockResolvedValueOnce(Response.json({ data: [] }));
    expect(await probeKrogerPricing(input, { ...config, fetcher })).toMatchObject({ status: "no-locations", location: null, products: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 429, 500])("sanitizes provider HTTP %s without echoing credential errors", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("synthetic-secret", { status }));
    await expect(probeKrogerPricing(input, { ...config, fetcher })).rejects.toMatchObject({ status: status === 429 ? 429 : 502 });
  });
});
