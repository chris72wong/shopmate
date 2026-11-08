import { describe, expect, it, vi } from "vitest";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";

// Synthetic example: protobuf JSON may omit the empty types array on an untyped component.
const place = { id: "synthetic-untyped", displayName: { text: "Walmart" }, formattedAddress: "1 Synthetic Street, Test City",
  addressComponents: [{ shortText: "Synthetic component" }, { shortText: "CA", types: ["country"] }],
  location: { latitude: 0, longitude: .01 }, googleMapsUri: "https://maps.google.com/?cid=1", types: ["grocery_store"], businessStatus: "OPERATIONAL" };
const input = { mode: "live" as const, location: { country: "CA" as const, postalCode: "M5V 2T6" }, radiusKm: 5 };
const geocode = { status: "OK", results: [{ formatted_address: "Synthetic origin", address_components: [
  { short_name: "CA", types: ["country"] }, { short_name: "M5V 2T6", types: ["postal_code"] }], geometry: { location: { lat: 0, lng: 0 } } }] };

describe("Google address component compatibility", () => {
  it("accepts an untyped address component while still finding authoritative country metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(geocode)).mockResolvedValueOnce(Response.json({ places: [place] })).mockResolvedValueOnce(Response.json(place));
    const provider = createGoogleStoreDiscovery({ apiKey: "synthetic", fetcher });
    expect((await provider.discover(input)).stores).toHaveLength(1);
    expect((await provider.resolveStores(["google:synthetic-untyped"], "CA"))[0]?.id).toBe("google:synthetic-untyped");
  });
  it("does not infer country when only untyped components are present", async () => {
    const untyped = { ...place, addressComponents: [{ shortText: "CA" }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(geocode)).mockResolvedValueOnce(Response.json({ places: [untyped] })).mockResolvedValueOnce(Response.json(untyped));
    const provider = createGoogleStoreDiscovery({ apiKey: "synthetic", fetcher });
    expect((await provider.discover(input)).stores).toEqual([]);
    await expect(provider.resolveStores(["google:synthetic-untyped"], "CA")).rejects.toMatchObject({ status: 422 });
  });
});
