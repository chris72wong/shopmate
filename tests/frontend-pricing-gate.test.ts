import { describe, expect, it } from "vitest";
import type { GoogleStore, PricingResultV2 } from "@/contracts";
import { initialPlanner, plannerReducer } from "@/lib/planner";
import { pricingViewSchema } from "@/lib/planner-api";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { CATALOG_VERSION, createRetailPricingService } from "@/server/pricing/service";

// Synthetic identity only; no provider request or production fixture is used.
const store: GoogleStore = { id: "google:gate-synthetic", name: "Loblaws", address: "Synthetic test address", country: "CA",
  chainId: "ca-loblaws", pricing: { status: "unavailable", profileId: null }, source: "google", googlePlaceId: "gate-synthetic",
  coordinates: { latitude: 0, longitude: 0 }, distanceMeters: 0, googleMapsUri: "https://maps.google.com/?cid=1" };
const service = createRetailPricingService({ config: { bindings: [], mappings: [] } });

describe("merged store pricing gate", () => {
  it("retains selected stores and preferences at Stores for actual unsupported-branch pricing", async () => {
    const prices = pricingViewSchema.parse(await service.pricing("live", "CA", [store]));
    const before = { ...initialPlanner("live", "CA"), step: 2, storeIds: [store.id] };
    const after = plannerReducer(before, { type: "pricing", data: prices });
    expect(after.step).toBe(2);
    expect(after.storeIds).toEqual(before.storeIds);
    expect(after.preferences).toEqual(before.preferences);
    expect(after.pricing?.stores[0]).toMatchObject({ status: "unavailable", reason: "unsupported-store" });
    expect(after.result).toBeNull();
  });

  it("stays at Stores even when an available pricing set contains zero offers", () => {
    const prices: PricingResultV2 = { mode: "live", country: "CA", currency: "CAD", catalogVersion: CATALOG_VERSION, notices: [],
      stores: [{ status: "available", storeId: store.id, basis: "verified", offers: [], missingIngredientIds: ["olive-oil"] }] };
    const after = plannerReducer({ ...initialPlanner("live", "CA"), step: 2, storeIds: [store.id] }, { type: "pricing", data: prices });
    expect(after.step).toBe(2);
    expect(after.pricing).toEqual(prices);
  });

  it.each(["CA", "US"] as const)("allows %s partial sample coverage alongside an unavailable store", async country => {
    const discovery = await demoStoreDiscovery.discover({ mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 5 });
    const prices = await service.pricing("demo", country, discovery.stores);
    const first = prices.stores[0]!;
    if (first.status !== "available" || first.basis !== "illustrative") throw Error("Expected illustrative sample prices.");
    prices.stores = [{ ...first, offers: first.offers.slice(0, 1), missingIngredientIds: ["olive-oil"] },
      { status: "unavailable", storeId: discovery.stores[1]!.id, reason: "no-usable-offers", message: "Ingredient prices unavailable" }];
    const before = { ...initialPlanner("demo", country), step: 2, discovery, storeIds: prices.stores.map(item => item.storeId) };
    expect(plannerReducer(before, { type: "pricing", data: prices }).step).toBe(3);
    prices.stores = [{ ...first, offers: first.offers.map(offer => ({ ...offer, available: false })) }];
    expect(plannerReducer(before, { type: "pricing", data: prices }).step).toBe(2);
  });
});
