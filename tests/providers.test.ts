import { describe, expect, it } from "vitest";
import type { GoogleStore } from "@/contracts";
import { getDemoStores } from "@/data/demo-stores";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { illustrativePricing } from "@/server/pricing/illustrative";

describe("demo provenance", () => {
  it.each(["CA", "US"] as const)("never invents nearby coordinates or distances for %s", async (country) => {
    const result = await demoStoreDiscovery.discover({ mode: "demo", location: {
      country, postalCode: country === "CA" ? "m5v2t6" : "02108",
    }, radiusKm: 10 });
    expect(result.stores).toHaveLength(3); expect(result.attributions).toEqual([]);
    expect(result.origin.coordinates).toBeNull(); expect(result.notices.join(" ")).toContain("fictional");
    for (const store of result.stores) {
      expect(store.source).toBe("demo"); expect(store.googlePlaceId).toBeNull();
      expect(store.distanceMeters).toBeNull(); expect(store.coordinates).toBeNull(); expect(store.chainId).toBeNull();
      expect(store.address).toContain("fictional");
    }
  });
  it("refuses live discovery and resolves only known same-country IDs", async () => {
    await expect(demoStoreDiscovery.discover({ mode: "live", location: { country: "US", postalCode: "14201" }, radiusKm: 5 })).rejects.toThrow();
    await expect(demoStoreDiscovery.resolveStores(["demo-us-clover"], "CA")).rejects.toThrow();
    await expect(demoStoreDiscovery.resolveStores(["demo-ca-unknown"], "CA")).rejects.toThrow();
    await expect(demoStoreDiscovery.resolveStores(["demo-ca-clover", "demo-ca-clover"], "CA")).rejects.toThrow();
    const stores = await demoStoreDiscovery.resolveStores(["demo-ca-clover", "demo-ca-cedar"], "CA");
    expect(stores.map((store) => store.id)).toEqual(["demo-ca-clover", "demo-ca-cedar"]);
  });
});

describe("illustrative pricing boundary", () => {
  it("returns only requested sample offers, without fabricating missing products", async () => {
    const store = getDemoStores("CA")[0]!;
    const result = await illustrativePricing.getOffers(store, ["pkg-oats", "missing-product"]);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Missing sample catalog");
    expect(result.basis).toBe("illustrative"); expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.price).toEqual({ amountCents: 649, currency: "CAD" });
  });
  it("marks unsupported stores and mismatched countries as unavailable", async () => {
    const store = getDemoStores("CA")[0]!;
    expect((await illustrativePricing.getOffers({ ...store, pricing: { status: "unavailable", profileId: null } }, ["pkg-oats"])).status).toBe("unavailable");
    expect((await illustrativePricing.getOffers({ ...store, country: "US" }, ["pkg-oats"])).status).toBe("unavailable");
  });
  it("requires a matching chain for Google stores, without performing network calls", async () => {
    const store: GoogleStore = {
      id: "google:test-fixture", name: "Test fixture only", address: "Test fixture only", country: "CA",
      source: "google", googlePlaceId: "test-fixture", coordinates: { latitude: 0, longitude: 0 },
      distanceMeters: 0, googleMapsUri: "https://maps.google.com/", chainId: "ca-no-frills",
      pricing: { status: "illustrative", profileId: "ca-loblaws" },
    };
    expect((await illustrativePricing.getOffers(store, ["pkg-oats"])).status).toBe("unavailable");
    store.pricing = { status: "illustrative", profileId: "ca-no-frills" };
    const result = await illustrativePricing.getOffers(store, ["pkg-oats"]);
    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.offers[0]?.price.currency).toBe("CAD");
  });
});
