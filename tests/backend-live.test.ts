import { expect, it } from "vitest";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { probeKrogerPricing } from "@/server/pricing/kroger-probe";

// Explicit opt-in: these consume provider quota. No provider responses are logged or saved.
const live = process.env.SHOPMATE_LIVE_SMOKE === "1";
it.skipIf(!live || !process.env.GOOGLE_MAPS_API_KEY)("credentialed Google CA/US smoke", async () => {
  for (const country of ["CA", "US"] as const) {
    const provider = createGoogleStoreDiscovery();
    const result = await provider.discover({ mode: "live", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 5 });
    expect(result.mode).toBe("live"); expect(result.origin.coordinates).not.toBeNull();
    expect(result.stores.every(store => store.country === country && store.source === "google")).toBe(true);
    if (result.stores[0]) expect((await provider.resolveStores([result.stores[0].id], country))[0]?.id).toBe(result.stores[0].id);
  }
}, 30_000);
it.skipIf(!live || !process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET || !process.env.KROGER_PROBE_POSTAL_CODE)("credentialed Kroger branch/product access probe", async () => {
  const result = await probeKrogerPricing({ country: "US", postalCode: process.env.KROGER_PROBE_POSTAL_CODE!, term: "oats" });
  expect(result.source).toBe("kroger");
  // A credentialed request can legitimately return zero locations/products; it does not prove coverage.
  expect(result.products.every(product => product.optimizerReady === false)).toBe(true);
}, 20_000);
