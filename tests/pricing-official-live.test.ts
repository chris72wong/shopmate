import { expect, it } from "vitest";
import { KrogerPricingAdapter } from "@/server/pricing/kroger";
import { loadRetailConfig } from "@/server/pricing/retail-config";

// Explicit opt-in only. Consumes retailer quota; never prints/saves upstream products or credentials.
const live = process.env.SHOPMATE_LIVE_SMOKE === "1";
it.skipIf(!live || !process.env.KROGER_CLIENT_ID || !process.env.KROGER_CLIENT_SECRET)("credentialed official Kroger branch/SKU retrieval", async context => {
  const config = loadRetailConfig();
  const binding = config.bindings.find(item => item.providerId === "kroger");
  const mapping = config.mappings.find(item => item.providerId === "kroger" && item.retailer === binding?.retailer && item.productId);
  if (!binding || !mapping?.productId) { context.skip("A reviewed official Kroger branch and SKU mapping are required."); return; }
  const adapter = new KrogerPricingAdapter();
  await adapter.verifyBranch(binding);
  const observations = await adapter.lookup(binding, mapping.productId);
  expect(observations.length).toBeGreaterThan(0);
  expect(observations.every(item => item.providerId === "kroger" && item.providerStoreId === binding.providerStoreId && item.country === "US")).toBe(true);
  expect(observations.some(item => item.regularPrice?.currency === "USD")).toBe(true);
}, 30_000);
