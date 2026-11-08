import { describe, expect, it, vi } from "vitest";
import type { Country, StoreDiscoveryRequest } from "@/contracts";
import { storeDiscoveryRequestSchema } from "@/contracts";
import { createGoogleStoreDiscovery, GoogleRequestGate } from "@/server/discovery/google";

// Entirely synthetic provider fixtures. No actual branches, provider recordings or user locations.
function input(country: Country, discoveryScope?: StoreDiscoveryRequest["discoveryScope"]): StoreDiscoveryRequest {
  return { mode: "live", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 10,
    ...(discoveryScope ? { discoveryScope } : {}) };
}
function place(id: string, country: Country, longitude = .01, name = "Synthetic Independent Grocery") {
  return { id, displayName: { text: name }, formattedAddress: "Synthetic test address",
    addressComponents: [{ types: ["country"], shortText: country }], location: { latitude: 0, longitude },
    googleMapsUri: "https://maps.google.com/?cid=synthetic", types: ["grocery_store"], primaryType: "grocery_store", businessStatus: "OPERATIONAL" };
}
function provider(country: Country, places: unknown[]) {
  const postalCode = input(country).location.postalCode;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ status: "OK", results: [{
    formatted_address: "Synthetic test origin", address_components: [{ types: ["country"], short_name: country }, { types: ["postal_code"], short_name: postalCode }],
    geometry: { location: { lat: 0, lng: 0 } },
  }] })).mockResolvedValueOnce(Response.json({ places }));
  return { fetcher, google: createGoogleStoreDiscovery({ apiKey: "synthetic-discovery-secret", fetcher, gate: new GoogleRequestGate() }) };
}

describe("explicit all-grocer discovery scope", () => {
  it.each(["CA", "US"] as const)("includes independent %s grocers only with the new scope and preserves legacy filtering", async country => {
    const candidates = [place("independent-b", country, .004), place("walmart-far", country, .02, "Walmart"),
      place("independent-a", country, .003), place("walmart-near", country, .005, "Walmart"), place("independent-a", country, .003)];
    const result = await provider(country, candidates).google.discover(input(country, "all-grocers"));
    expect(result.stores.map(store => store.id)).toEqual(["google:independent-a", "google:independent-b", "google:walmart-near"]);
    for (const independent of result.stores.slice(0, 2)) {
      expect(independent.chainId).toBeNull(); expect(independent.source).toBe("google");
      expect(independent.pricing).toEqual({ status: "unavailable", profileId: null });
    }
    expect(result.stores[2]?.chainId).toBe(country === "CA" ? "ca-walmart" : "us-walmart");
    expect(result.notices.join(" ")).toContain("including independent grocers");
    expect(result.notices.join(" ")).toContain("bounded search");
    expect(result.mode).toBe("live"); expect(result.location.currency).toBe(country === "CA" ? "CAD" : "USD");
    const legacy = await provider(country, candidates).google.discover(input(country));
    const explicitMajor = await provider(country, candidates).google.discover(input(country, "major-chains"));
    expect(legacy.stores.map(store => store.id)).toEqual(["google:walmart-near"]);
    expect(explicitMajor).toEqual(legacy);
    expect(legacy.notices.join(" ")).toContain("Major grocery chains");
  });

  it.each(["CA", "US"] as const)("still excludes unsafe or ineligible %s results and retains attribution only for returned grocers", async country => {
    const otherCountry = country === "CA" ? "US" : "CA";
    const rejected = [
      place("wrong-country", otherCountry), { ...place("closed", country), businessStatus: "CLOSED_PERMANENTLY" },
      { ...place("pharmacy", country), primaryType: "pharmacy" }, { ...place("fuel", country), primaryType: "gas_station" },
      { ...place("liquor", country), primaryType: "liquor_store" }, { ...place("wholesale", country), primaryType: "wholesaler" },
      { ...place("restaurant", country), types: ["restaurant"], primaryType: "restaurant" }, place("too-far", country, 1),
      { ...place("unknown-primary-pharmacy", country), primaryType: undefined, types: ["pharmacy", "grocery_store"] },
    ].map(item => ({ ...item, attributions: [{ provider: "Excluded credit", providerUri: "https://example.org/excluded" }] }));
    const valid = { ...place("eligible-independent", country), primaryType: "supermarket", types: ["supermarket", "pharmacy"],
      attributions: [{ provider: "Synthetic included credit", providerUri: "https://example.org/included" }] };
    const result = await provider(country, [...rejected, valid]).google.discover(input(country, "all-grocers"));
    expect(result.stores.map(store => store.id)).toEqual(["google:eligible-independent"]);
    expect(result.stores[0]?.pricing.status).toBe("unavailable");
    expect(result.attributions).toEqual([{ provider: "google-maps", displayName: "Synthetic included credit", uri: "https://example.org/included" }]);
    expect(JSON.stringify(result)).not.toContain("synthetic-discovery-secret");
  });

  it.each(["CA", "US"] as const)("keeps %s country restriction, radius, result cap, deadlines and explicit field masks", async country => {
    const { fetcher, google } = provider(country, [place("eligible", country)]);
    await google.discover(input(country, "all-grocers"));
    const geocoding = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(geocoding.searchParams.get("components")).toBe(`country:${country}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = fetcher.mock.calls[1]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ includedTypes: ["grocery_store", "supermarket"], maxResultCount: 20,
      rankPreference: "DISTANCE", regionCode: country, locationRestriction: { circle: { radius: 10_000 } } });
    expect(request?.signal).toBeInstanceOf(AbortSignal); expect(request?.cache).toBe("no-store");
    const fields = new Headers(request?.headers).get("X-Goog-FieldMask");
    expect(fields).toContain("places.addressComponents"); expect(fields).toContain("places.attributions");
    expect(fields).toContain("places.businessStatus"); expect(fields).toContain("places.primaryType"); expect(fields).not.toContain("*");
  });

  it("makes broader discovery an explicit validated opt-in", () => {
    expect(storeDiscoveryRequestSchema.parse(input("CA")).discoveryScope).toBeUndefined();
    expect(storeDiscoveryRequestSchema.safeParse(input("CA", "all-grocers")).success).toBe(true);
    expect(storeDiscoveryRequestSchema.safeParse({ ...input("CA"), discoveryScope: "all-businesses" }).success).toBe(false);
  });

  it("does not broaden authoritative optimizer store resolution", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(place("selected-independent", "CA")));
    const google = createGoogleStoreDiscovery({ apiKey: "synthetic-discovery-secret", fetcher, gate: new GoogleRequestGate() });
    await expect(google.resolveStores(["google:selected-independent"], "CA")).rejects.toMatchObject({ status: 422, error: { code: "invalid-request" } });
  });
});
