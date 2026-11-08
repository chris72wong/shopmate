import { describe, expect, it, vi } from "vitest";
import type { Country, StoreDiscoveryRequest } from "@/contracts";
import { matchChain, matchGroceryBanner } from "@/server/discovery/chains";
import { createGoogleStoreDiscovery, GoogleRequestGate } from "@/server/discovery/google";

const allowed: Record<Country, string[]> = {
  CA: ["Loblaws", "No Frills", "Real Canadian Superstore", "Atlantic Superstore", "Zehrs", "Fortinos", "Your Independent Grocer", "Valu-Mart", "Provigo", "Maxi", "Dominion", "Sobeys", "Safeway", "IGA", "Foodland", "FreshCo", "Thrifty Foods", "Longo’s", "Farm Boy", "Metro", "Food Basics", "Super C", "Save-On-Foods", "Walmart"],
  US: ["Walmart", "ALDI", "Lidl", "Kroger", "Ralphs", "Fred Meyer", "Fry’s", "King Soopers", "City Market", "Smith’s", "Dillons", "Baker’s", "Gerbes", "QFC", "Pick ’n Save", "Metro Market", "Mariano’s", "Food 4 Less", "Foods Co", "Jay C", "Pay-Less", "Harris Teeter", "Albertsons", "Safeway", "Vons", "Pavilions", "Jewel-Osco", "ACME", "Shaw’s", "Star Market", "Tom Thumb", "Randalls", "United Supermarkets", "Market Street", "Carrs", "Haggen", "Food Lion", "Hannaford", "Stop & Shop", "Giant", "Martin’s", "Publix", "H-E-B", "Meijer", "Wegmans", "WinCo", "Hy-Vee", "ShopRite", "Giant Eagle", "Grocery Outlet", "Save A Lot"],
};

describe("country-specific major grocery banners", () => {
  for (const country of ["CA", "US"] as const) {
    it.each(allowed[country])(`recognizes %s in ${country} with distinct internal grouping`, name => {
      const banner = matchGroceryBanner(name, country);
      expect(banner).not.toBeNull();
      expect(banner?.id.startsWith(`${country.toLowerCase()}-`)).toBe(true);
      const others = allowed[country].filter(other => other !== name).map(other => matchGroceryBanner(other, country)?.id);
      expect(others).not.toContain(banner?.id);
    });
    const otherCountry = country === "CA" ? "US" : "CA";
    it.each(allowed[country].filter(name => !allowed[otherCountry].includes(name)))(`does not recognize %s in ${otherCountry}`, name => {
      expect(matchGroceryBanner(name, otherCountry)).toBeNull();
    });
  }
  it.each([
    ["  JOE’S   NO-FRILLS  ", "No Frills", "CA"], ["Mike & Ana’s Nofrills", "No Frills", "CA"],
    ["O’Brien’s No Frills", "No Frills", "CA"], ["Loblaws CityMarket", "Loblaws", "CA"],
    ["Chalo! FreshCo", "FreshCo", "CA"], ["Zehrs Great Food", "Zehrs", "CA"],
    ["Provigo Le Marche", "Provigo", "CA"], ["Maxi et Cie", "Maxi", "CA"],
    ["IGA EXTRA", "IGA", "CA"], ["Métro Plus", "Metro", "CA"], ["Sobeys Urban Fresh", "Sobeys", "CA"],
    ["Longo's", "Longo’s", "CA"], ["Save On Foods", "Save-On-Foods", "CA"],
    ["Walmart Supercentre", "Walmart", "CA"], ["Walmart Neighborhood Market", "Walmart", "US"],
    ["Fry's Food & Drug", "Fry’s", "US"], ["Smith’s Marketplace", "Smith’s", "US"],
    ["Pick'n Save", "Pick ’n Save", "US"], ["Pick N Save", "Pick ’n Save", "US"],
    ["H.E.B. plus!", "H-E-B", "US"], ["HEB", "H-E-B", "US"],
    ["Jewel Osco", "Jewel-Osco", "US"], ["Stop and Shop", "Stop & Shop", "US"],
    ["ACME Markets", "ACME", "US"], ["Hannaford Supermarket", "Hannaford", "US"],
    ["Publix Super Market at Synthetic Plaza", "Publix", "US"], ["ShopRite of Synthetic Town", "ShopRite", "US"],
    ["Market District", "Giant Eagle", "US"], ["Grocery Outlet Bargain Market", "Grocery Outlet", "US"],
  ] as const)("groups known format %s under %s", (variant, canonical, country) => {
    expect(matchGroceryBanner(variant, country)).toEqual(matchGroceryBanner(canonical, country));
  });
  it.each([
    "Independent Grocery", "Joe’s Grocery", "Loblaws-ish Market", "Not Walmart Grocery", "Walmartish", "Walmart Pharmacy",
    "Walmart Fuel Station", "Kroger Fuel Center", "Kroger Pharmacy", "ALDI Gas", "Lidl Express", "Sobeys Liquor",
    "Metro Convenience", "Giant Tiger", "Giant Market", "Foodland Pharmacy", "No Frills Pharmacy", "Joe's No Frills Fuel",
    "No Frills Market", "No Thrills", "No Frills at Joe’s", "Costco", "Sam’s Club", "BJ’s Wholesale Club", "Wholesale Club",
    "Whole Foods Market", "Trader Joe’s", "Bulk Barn", "Shoppers Drug Mart", "CVS", "Walgreens", "7-Eleven",
    "Publix Super Market at Pharmacy", "ShopRite of Synthetic Town Fuel Center", "Walmart Supercenter Pharmacy",
  ])("rejects excluded businesses and misleading name %s", name => {
    expect(matchGroceryBanner(name, "CA")).toBeNull();
    expect(matchGroceryBanner(name, "US")).toBeNull();
  });
  it("preserves public chain IDs and keeps new banner identities internal", () => {
    expect(matchChain("Joe’s No Frills", "CA")).toBe("ca-no-frills");
    expect(matchChain("Loblaws", "CA")).toBe("ca-loblaws");
    expect(matchChain("Walmart Supercentre", "CA")).toBe("ca-walmart");
    expect(matchChain("Walmart Neighborhood Market", "US")).toBe("us-walmart");
    expect(matchChain("ALDI", "US")).toBe("us-aldi");
    expect(matchChain("Kroger Marketplace", "US")).toBe("us-kroger");
    expect(matchChain("Ralphs", "US")).toBeNull();
    expect(matchChain("Real Canadian Superstore", "CA")).toBeNull();
    expect(matchChain("Metro", "CA")).toBeNull();
  });
});

// Synthetic provider data only; names exercise recognition, never claim actual branches.
function place(id: string, name: string, longitude = .01, country: Country = "CA") {
  return { id, displayName: { text: name }, formattedAddress: "Synthetic address, test only", addressComponents: [{ types: ["country"], shortText: country }],
    location: { latitude: 0, longitude }, googleMapsUri: "https://maps.google.com/?cid=1", types: ["grocery_store"], businessStatus: "OPERATIONAL" };
}
function provider(places: unknown[], country: Country = "CA") {
  const postalCode = country === "CA" ? "M5V 2T6" : "02108";
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ status: "OK", results: [{
    formatted_address: "Synthetic origin", address_components: [{ types: ["country"], short_name: country }, { types: ["postal_code"], short_name: postalCode }],
    geometry: { location: { lat: 0, lng: 0 } },
  }] })).mockResolvedValueOnce(Response.json({ places }));
  const input: StoreDiscoveryRequest = { mode: "live", location: { country, postalCode }, radiusKm: 5 };
  return { input, fetcher, google: createGoogleStoreDiscovery({ apiKey: "synthetic-key", fetcher, gate: new GoogleRequestGate() }) };
}

describe("major-grocer discovery and authoritative resolution", () => {
  it("keeps nearest returned branches, uses stable ID ties and separates corporate siblings", async () => {
    const candidates = [place("walmart-far", "Walmart Supercentre", .02), place("loblaws", "Loblaws", .012),
      place("no-frills-z", "Joe’s No Frills"), place("no-frills-a", "Ana’s No Frills"),
      place("walmart-near", "Walmart", .005), place("sobeys-z", "Sobeys Extra", .005), place("superstore", "Real Canadian Superstore", .015)];
    const expected = ["google:sobeys-z", "google:walmart-near", "google:no-frills-a", "google:loblaws", "google:superstore"];
    for (const places of [candidates, [...candidates].reverse()]) {
      const { google, input, fetcher } = provider(places);
      const result = await google.discover(input);
      expect(result.stores.map(store => store.id)).toEqual(expected);
      expect(result.stores.every(store => store.pricing.status === "unavailable")).toBe(true);
      expect(result.stores.find(store => store.id === "google:superstore")?.chainId).toBeNull();
      expect(JSON.stringify(result.stores)).not.toContain("bannerId");
      expect(result.notices).toContain("Major grocery chains · nearest location per banner.");
      expect(result.notices.join(" ")).toContain("nearest returned branch");
      expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({ maxResultCount: 20, rankPreference: "DISTANCE" });
      expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("X-Goog-FieldMask")).toContain("places.primaryType");
    }
  });
  it("groups grocery format variants while retaining Kroger siblings and Giant banners separately", async () => {
    const { google, input } = provider([place("kroger-far", "Kroger Marketplace", .02, "US"), place("kroger-near", "Kroger", .01, "US"),
      place("ralphs", "Ralphs Fresh Fare", .015, "US"), place("giant", "Giant", .025, "US"), place("giant-eagle", "Giant Eagle", .03, "US")], "US");
    expect((await google.discover(input)).stores.map(store => store.id)).toEqual(["google:kroger-near", "google:ralphs", "google:giant", "google:giant-eagle"]);
  });
  it("filters independent, excluded-format, wrong-country, closed and distant stores with truthful empty notices", async () => {
    const places = [place("independent", "Synthetic Grocery"), place("club", "Costco"), place("pharmacy", "Walmart Pharmacy"),
      { ...place("fuel-type", "Walmart"), primaryType: "gas_station" },
      { ...place("pharmacy-type", "Loblaws"), primaryType: "pharmacy" },
      { ...place("fuel-no-primary", "Walmart"), types: ["gas_station", "grocery_store"] },
      { ...place("closed", "Loblaws"), businessStatus: "CLOSED_TEMPORARILY" },
      place("cross-border", "Walmart", .01, "US"), place("far", "Sobeys", 1)];
    const { google, input } = provider(places);
    const result = await google.discover(input);
    expect(result.stores).toEqual([]);
    expect(result.mode).toBe("live");
    expect(result.notices.join(" ")).toContain("other stores may exist nearby");
    expect(result.notices.join(" ")).not.toMatch(/no stores exist|all nearby stores/i);
  });
  it("retains attribution for returned branches and permits a supermarket with an ancillary pharmacy", async () => {
    const returned = { ...place("eligible", "Sobeys"), primaryType: "supermarket", types: ["supermarket", "pharmacy"],
      attributions: [{ provider: "Synthetic credit", providerUri: "https://example.org/credit" }] };
    const { google, input } = provider([returned]);
    const result = await google.discover(input);
    expect(result.stores).toHaveLength(1);
    expect(result.attributions).toEqual([{ provider: "google-maps", displayName: "Synthetic credit", uri: "https://example.org/credit" }]);
  });
  it.each([place("selected", "Independent Grocery"), place("selected", "Costco"), place("selected", "Walmart Pharmacy"),
    { ...place("selected", "Loblaws"), primaryType: "gas_station" }, place("selected", "ALDI")])("rejects direct selection of an ineligible Google place", async item => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(item));
    const google = createGoogleStoreDiscovery({ apiKey: "synthetic-key", fetcher, gate: new GoogleRequestGate() });
    await expect(google.resolveStores(["google:selected"], "CA")).rejects.toMatchObject({ status: 422, error: { code: "invalid-request", details: [{ path: "storeIds", message: expect.stringContaining("Choose other stores") }] } });
  });
  it("resolves newly allowed banners without adding public chain IDs or granting sample pricing", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(place("selected", "Real Canadian Superstore")));
    const google = createGoogleStoreDiscovery({ apiKey: "synthetic-key", fetcher, gate: new GoogleRequestGate() });
    expect(await google.resolveStores(["google:selected"], "CA")).toEqual([{ id: "google:selected", name: "Real Canadian Superstore", address: "Synthetic address, test only", country: "CA", source: "google", chainId: null, pricing: { status: "unavailable", profileId: null } }]);
  });
});
