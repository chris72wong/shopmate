import { describe, expect, it } from "vitest";
import type { ChainId, Country, DemoStore, GoogleStore } from "@/contracts";
import { storeDirectionsLink, storeSearchLink, storeShoppingOption, storeWebsiteLink } from "@/lib/store-shopping";
import { shoppingListText } from "@/lib/meal-shopping";

function store(patch: Partial<GoogleStore> = {}): GoogleStore {
  return {
    id: "google:test-store", name: "Test Grocery", address: "Synthetic test address", country: "CA", chainId: null,
    source: "google", googlePlaceId: "test-place-id", coordinates: { latitude: 43, longitude: -79 },
    distanceMeters: 1000, googleMapsUri: "https://maps.google.com/?cid=test-place-id",
    pricing: { status: "unavailable", profileId: null }, ...patch,
  };
}
const demo: DemoStore = {
  id: "demo-ca-cedar", name: "Walmart", address: "Fictional fixture address", country: "CA", chainId: "ca-walmart",
  source: "demo", googlePlaceId: null, coordinates: null, distanceMeters: null, googleMapsUri: null,
  pricing: { status: "illustrative", profileId: "demo-ca-cedar" },
};

describe("selected-store shopping handoff", () => {
  it.each([
    ["CA", "ca-walmart", "Walmart Canada", "https://www.walmart.ca/en/search?q="],
    ["CA", "ca-no-frills", "No Frills", "https://www.nofrills.ca/en/search?search-bar="],
    ["CA", "ca-loblaws", "Loblaws", "https://www.loblaws.ca/en/search?search-bar="],
    ["US", "us-walmart", "Walmart US", "https://www.walmart.com/search?q="],
    ["US", "us-kroger", "Kroger", "https://www.kroger.com/search?query="],
  ] satisfies [Country, ChainId, string, string][]) ("uses the verified %s %s retailer search", (country, chainId, retailerName, base) => {
    const selected = store({ country, chainId });
    expect(storeShoppingOption(selected)?.retailerName).toBe(retailerName);
    expect(storeSearchLink(selected, "  rice & beans / sauce?  ")).toEqual({ name: retailerName, url: `${base}rice%20%26%20beans%20%2F%20sauce%3F` });
    expect(storeWebsiteLink(selected)).toEqual({ name: retailerName, url: new URL(base).origin });
  });

  it.each([
    ["CA", "us-walmart"], ["CA", "us-kroger"], ["US", "ca-walmart"], ["US", "ca-no-frills"], ["US", "ca-loblaws"],
  ] satisfies [Country, ChainId][]) ("does not cross regional boundaries for %s and %s", (country, chainId) => {
    const selected = store({ country, chainId });
    expect(storeShoppingOption(selected)).toBeNull(); expect(storeSearchLink(selected, "rice")).toBeNull();
  });

  it("does not infer retailer support from a familiar name or substitute a different retailer", () => {
    expect(storeSearchLink(store({ name: "Walmart Supercentre" }), "rice")).toBeNull();
    expect(storeSearchLink(store({ name: "Local Market" }), "rice")).toBeNull();
    expect(storeSearchLink(store({ country: "US", chainId: "us-aldi" }), "rice")).toBeNull();
    expect(storeSearchLink(store({ chainId: "ca-walmart" }), "  ")).toBeNull();
  });

  it("never treats fictional stores as actual retailer shopping or directions", () => {
    expect(storeShoppingOption(demo)).toBeNull(); expect(storeSearchLink(demo, "rice")).toBeNull();
    expect(storeWebsiteLink(demo)).toBeNull(); expect(storeDirectionsLink(demo)).toBeNull();
  });

  it("provides only the verified Farm Boy homepage without inventing an ingredient search", () => {
    const selected = store({ name: " Farm Boy " });
    expect(storeWebsiteLink(selected)).toEqual({ name: "Farm Boy", url: "https://www.farmboy.ca/" });
    expect(storeSearchLink(selected, "rice")).toBeNull();
    expect(storeWebsiteLink(store({ name: "Farm Boy", country: "US" }))).toBeNull();
    expect(storeWebsiteLink(store({ name: "Farm Boy Outlet" }))).toBeNull();
  });

  it("builds directions to the selected actual place and safely encodes the destination", () => {
    const selected = store({ name: "A & B Market", address: "Synthetic street #2", googlePlaceId: "test/place?id" });
    const url = new URL(storeDirectionsLink(selected)!);
    expect(url.origin).toBe("https://www.google.com"); expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("destination")).toBe("A & B Market, Synthetic street #2");
    expect(url.searchParams.get("destination_place_id")).toBe("test/place?id"); expect(url.searchParams.get("api")).toBe("1");
    expect([...url.searchParams.keys()]).toEqual(["api", "destination", "destination_place_id"]);
  });

  it("keeps the selected actual grocer and directions in the portable list", () => {
    const selected = store({ name: "Selected Test Market" });
    const text = shoppingListText([], [], "CA", selected);
    expect(text).toContain("Selected grocer: Selected Test Market"); expect(text).toContain(selected.address);
    expect(text).toContain(`Directions: ${storeDirectionsLink(selected)}`);
    expect(text).toContain("Store information: Google Maps");
    expect(text).toContain("Check the retailer for stock, prices and pickup/delivery options");
  });

  it("omits fictional, wrong-country and absent stores from exported shopping context", () => {
    for (const selected of [demo, store({ country: "US" }), null, undefined]) {
      const text = shoppingListText([], [], "CA", selected);
      expect(text).not.toContain("Selected grocer:"); expect(text).not.toContain("Directions:");
      expect(text).toContain("Canada · CAD");
    }
  });
});
