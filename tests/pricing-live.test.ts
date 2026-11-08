import { expect, it } from "vitest";
import { createBidouDealsReader } from "@/server/pricing/bidou-deals";
import { ReefPricingAdapter } from "@/server/pricing/reef";
import { loadRetailConfig } from "@/server/pricing/retail-config";
import { matchVerifiedOffer } from "@/server/pricing/matching";
import { ingredients } from "@/data/ingredients";

// Real network tests are separate from repeatable synthetic provider fixtures.
const live = process.env.SHOPMATE_LIVE_SMOKE === "1";
it.skipIf(!live)("live public Ontario Bidou feed returns dated regional offers", async () => {
  const result = await createBidouDealsReader()("ON");
  expect(result.deals.length).toBeGreaterThan(0);
  expect(result.deals.some(deal => deal.price?.currency === "CAD" && deal.retailer)).toBe(true);
  expect(result.deals.every(deal => !deal.optimizerEligible && deal.scope === "region" && Number.isFinite(Date.parse(deal.observedAt)))).toBe(true);
}, 15_000);
it.skipIf(!live || !process.env.REEF_KEY)("credentialed Reef exact-branch reviewed product probes", async () => {
  const config = loadRetailConfig();
  const branches = config.bindings.slice(0, 3);
  expect(branches.length, "Configure SHOPMATE_PRICING_STORES before the credentialed probe.").toBeGreaterThan(0);
  const adapter = new ReefPricingAdapter();
  for (const binding of branches) {
    const mapping = config.mappings.find(item => item.providerId === binding.providerId && item.retailer === binding.retailer);
    expect(mapping, "Configure at least one reviewed product for each probed retailer.").toBeDefined();
    const ingredient = ingredients.find(item => item.id === mapping!.ingredientId);
    expect(ingredient, "Use a known ingredient for the reviewed product.").toBeDefined();
    await adapter.verifyBranch(binding);
    const rows = await adapter.search(binding, mapping!.expectedName);
    expect(rows.some(row => matchVerifiedOffer(row, mapping!, binding, ingredient!, Date.now()))).toBe(true);
  }
}, 60_000);
