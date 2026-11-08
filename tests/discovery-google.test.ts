import { describe, expect, it, vi } from "vitest";
import type { Country, StoreDiscoveryRequest } from "@/contracts";
import { matchChain } from "@/server/discovery/chains";
import { createGoogleStoreDiscovery, distanceMeters, GoogleRequestGate } from "@/server/discovery/google";

// Entirely synthetic upstream data; no recorded Google responses, real stores or user locations.
const request = (country: Country = "CA"): StoreDiscoveryRequest => ({ mode: "live", location: { country, postalCode: country === "CA" ? "m5v2t6" : "02108" }, radiusKm: 5 });
function geocode(country: Country = "CA", postal = country === "CA" ? "M5V 2T6" : "02108") {
  return { status: "OK", results: [{ formatted_address: "Synthetic search origin", address_components: [
    { types: ["country"], short_name: country }, { types: ["postal_code"], short_name: postal },
  ], geometry: { location: { lat: 0, lng: 0 } } }] };
}
function place(id = "synthetic", country: Country = "CA") {
  return { id, displayName: { text: "Walmart" }, formattedAddress: "Synthetic address, test only", addressComponents: [{ types: ["country"], shortText: country }],
    location: { latitude: 0, longitude: .01 }, googleMapsUri: "https://maps.google.com/?cid=123", types: ["grocery_store"], businessStatus: "OPERATIONAL" };
}
function provider(...responses: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(Response.json(response));
  return { fetcher, google: createGoogleStoreDiscovery({ apiKey: "synthetic-secret", fetcher, gate: new GoogleRequestGate() }) };
}

describe("Google discovery", () => {
  it.each(["CA", "US"] as const)("restricts %s geocoding, validates country, uses bounded Places New fields and returns provenance", async country => {
    const item = { ...place("synthetic", country), attributions: [{ provider: "Synthetic attribution", providerUri: "https://example.org/license" }] };
    const { google, fetcher } = provider(geocode(country), { places: [item] });
    const result = await google.discover(request(country));
    expect(result.mode).toBe("live"); expect(result.location.currency).toBe(country === "CA" ? "CAD" : "USD");
    expect(result.location.postalCode).toBe(country === "CA" ? "M5V 2T6" : "02108");
    const geocodeUrl = new URL(String(fetcher.mock.calls[0]![0]));
    expect(geocodeUrl.searchParams.get("components")).toBe(`country:${country}`);
    expect(geocodeUrl.searchParams.get("address")).toBe(result.location.postalCode);
    const init = fetcher.mock.calls[1]![1]!;
    expect(String(fetcher.mock.calls[1]![0])).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.method).toBe("POST"); expect(init.cache).toBe("no-store"); expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("X-Goog-FieldMask")).toContain("places.attributions");
    expect(new Headers(init.headers).get("X-Goog-FieldMask")).not.toContain("*");
    expect(JSON.parse(String(init.body))).toMatchObject({ maxResultCount: 20, rankPreference: "DISTANCE", locationRestriction: { circle: { radius: 5000 } } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result.stores[0]).toMatchObject({ id: "google:synthetic", source: "google", name: item.displayName.text, address: item.formattedAddress, distanceMeters: 1112, pricing: { status: "unavailable", profileId: null } });
    expect(result.attributions).toEqual([{ provider: "google-maps", displayName: "Synthetic attribution", uri: "https://example.org/license" }]);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("keeps empty nearby results distinct from an unresolved location", async () => {
    expect((await provider(geocode(), {}).google.discover(request())).stores).toEqual([]);
    await expect(provider({ status: "ZERO_RESULTS", results: [] }).google.discover(request())).rejects.toMatchObject({ status: 404, error: { code: "not-found" } });
  });
  it.each([geocode("US", "M5V 2T6"), geocode("CA", "M5V 1A1"), { ...geocode(), results: geocode().results.map(result => ({ ...result, partial_match: true })) }])("rejects wrong-country, wrong-postal and partial geocodes", async response => {
    const { google, fetcher } = provider(response);
    await expect(google.discover(request())).rejects.toMatchObject({ status: 404 }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires a matching ZIP+4 suffix instead of accepting an unverified extension", async () => {
    const input = { ...request("US"), location: { country: "US" as const, postalCode: "02108-1234" } };
    await expect(provider(geocode("US")).google.discover(input)).rejects.toMatchObject({ status: 404 });
    const response = geocode("US"); response.results[0]!.address_components.push({ types: ["postal_code_suffix"], short_name: "1234" });
    expect((await provider(response, {}).google.discover(input)).location.postalCode).toBe("02108-1234");
  });
  it("filters cross-border, closed, non-grocery, distant and duplicate places; sorts stable distances", async () => {
    const close = { ...place("z"), displayName: { text: "Sobeys" }, location: { latitude: 0, longitude: .005 } };
    const { google } = provider(geocode(), { places: [place("a"), close, close, place("cross", "US"), { ...place("closed"), businessStatus: "CLOSED_PERMANENTLY" },
      { ...place("fuel"), types: ["gas_station"] }, { ...place("far"), location: { latitude: 1, longitude: 1 } }] });
    expect((await google.discover(request())).stores.map(store => store.id)).toEqual(["google:z", "google:a"]);
  });
  it("returns missing-credential and quota failures without fallback", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createGoogleStoreDiscovery({ apiKey: "", fetcher }).discover(request())).rejects.toMatchObject({ status: 503 }); expect(fetcher).not.toHaveBeenCalled();
    await expect(provider({ status: "OVER_QUERY_LIMIT" }).google.discover(request())).rejects.toMatchObject({ status: 429 });
    fetcher.mockResolvedValue(new Response("secret provider payload", { status: 429 }));
    await expect(createGoogleStoreDiscovery({ apiKey: "test", fetcher }).discover(request())).rejects.toMatchObject({ status: 429 });
  });
  it.each([new Error("key=do-not-leak"), new DOMException("private URL", "TimeoutError")])("sanitizes network failures and deadlines", async error => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(createGoogleStoreDiscovery({ apiKey: "secret", fetcher }).discover(request())).rejects.toMatchObject({ status: 502, error: { code: "provider-error" } });
    try { await createGoogleStoreDiscovery({ apiKey: "secret", fetcher }).discover(request()); } catch (failure) { expect(JSON.stringify(failure)).not.toContain("do-not-leak"); }
  });
  it.each([{ ...place(), location: { latitude: 200, longitude: 0 } }, { ...place(), googleMapsUri: "javascript:alert(1)" }, { ...place(), attributions: [{ provider: "Test", providerUri: "https://example.org/?key=secret" }] }])("fails closed on malformed provider data or unsafe links", async item => {
    await expect(provider(geocode(), { places: [item] }).google.discover(request())).rejects.toMatchObject({ status: 502 });
  });
  it("re-resolves place IDs and refuses wrong-country, non-grocery or changed identities", async () => {
    const { google, fetcher } = provider({ ...place(), displayName: { text: "Walmart Supercentre" } });
    const [store] = await google.resolveStores(["google:synthetic"], "CA");
    expect(store).toMatchObject({ chainId: "ca-walmart", pricing: { status: "unavailable", profileId: null } });
    expect(store).not.toHaveProperty("distanceMeters");
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("X-Goog-FieldMask")).toContain("addressComponents");
    await expect(provider(place("synthetic", "US")).google.resolveStores(["google:synthetic"], "CA")).rejects.toMatchObject({ status: 422 });
    await expect(provider(place("changed")).google.resolveStores(["google:synthetic"], "CA")).rejects.toMatchObject({ status: 422 });
    await expect(provider().google.resolveStores(["google:../path"], "CA")).rejects.toMatchObject({ status: 422 });
  });
  it("does not claim sample prices are live quotes after recognizing a banner", async () => {
    const { google } = provider(geocode(), { places: [{ ...place(), displayName: { text: "Loblaws" } }] });
    const result = await google.discover(request());
    expect(result.stores[0]?.pricing.status).toBe("unavailable"); expect(result.notices.join(" ")).toContain("only in explicit demo mode");
  });
  it("bounds upstream calls per process and releases concurrency after errors", async () => {
    let now = 100_000; const gate = new GoogleRequestGate(1, 1, () => now);
    await expect(gate.run(async () => { throw Error("synthetic"); })).rejects.toThrow("synthetic");
    await expect(gate.run(async () => true)).rejects.toMatchObject({ status: 429 });
    now += 60_000; expect(await gate.run(async () => true)).toBe(true);
  });
  it("calculates physical straight-line distance without turning null/unknown into zero", () => {
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(0);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeGreaterThan(20_000_000);
  });
});
describe("conservative chain recognition", () => {
  it.each([ ["Loblaws", "CA", "ca-loblaws"], ["Joe’s No Frills", "CA", "ca-no-frills"], ["ALDI", "US", "us-aldi"], ["Kroger Marketplace", "US", "us-kroger"], ["Walmart Supercenter", "US", "us-walmart"],
    ["ALDI", "CA", null], ["Loblaws", "US", null], ["Kroger Fuel Center", "US", null], ["Walmart Pharmacy", "CA", null], ["Not Walmart Grocery", "CA", null] ] as const)("matches %s only in %s with grocery-banner certainty", (name, country, expected) => {
    expect(matchChain(name, country)).toBe(expected);
  });
});
