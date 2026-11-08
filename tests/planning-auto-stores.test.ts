import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse, Country, PlanningResultV2, StoreDiscoveryResultV2 } from "@/contracts";
import { POST as plan } from "@/app/api/v2/plan/route";
import { POST as discover } from "@/app/api/v2/stores/route";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { jsonRequest, optimizationRequest } from "./fixtures";

function place(id: string, name: string, longitude: number, country: Country = "CA") {
  return { id, displayName: { text: name }, formattedAddress: country === "CA" ? "1 Synthetic Street, Test City, ON M5V 2T6" : "1 Synthetic Street, Test City, MA 02108, USA",
    addressComponents: [{ types: ["country"], shortText: country }], location: { latitude: 0, longitude },
    googleMapsUri: "https://maps.google.com/?cid=1", types: ["grocery_store"], primaryType: "grocery_store", businessStatus: "OPERATIONAL",
    attributions: [{ provider: "Synthetic attribution", providerUri: "https://example.org/attribution" }] };
}
function google(places: ReturnType<typeof place>[], country: Country = "CA") {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async target => String(target).includes("geocode")
    ? Response.json({ status: "OK", results: [{ formatted_address: "Synthetic origin", address_components: [{ types: ["country"], short_name: country }, { types: ["postal_code"], short_name: country === "CA" ? "M5V 2T6" : "02108" }], geometry: { location: { lat: 0, lng: 0 } } }] })
    : Response.json({ places }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function input(country: Country = "CA") {
  const preferences = optimizationRequest().preferences;
  return { mode: "live" as const, location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 5,
    catalogVersion: CATALOG_VERSION, preferences: { ...preferences, mealCount: 1, weeklyBudget: { amountCents: 8000, currency: country === "CA" ? "CAD" : "USD" } } };
}
async function planned(response: Response) {
  const body = await response.json() as ApiResponse<PlanningResultV2>;
  expect(response.status).toBe(200); expect(body.ok).toBe(true);
  if (!body.ok) throw Error("Expected planning envelope.");
  return body.data;
}
beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "synthetic-key"); vi.stubEnv("REEF_KEY", ""); vi.stubEnv("KROGER_CLIENT_ID", ""); vi.stubEnv("KROGER_CLIENT_SECRET", "");
  vi.stubEnv("SHOPMATE_PRICING_STORES", "[]"); vi.stubEnv("SHOPMATE_PRICING_PRODUCTS", "[]");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("automatic nearest-banner selection and one-call planning", () => {
  it("selects three closest distinct banners with ID tie-breaking, keeps siblings/alternatives and attribution", async () => {
    const fetcher = google([place("walmart-far", "Walmart", .03), place("nofrills-z", "Joe’s No Frills", .01), place("nofrills-a", "Ana’s No Frills", .01),
      place("loblaws", "Loblaws", .008), place("sobeys", "Sobeys", .015), place("walmart-near", "Walmart", .012), place("independent", "Synthetic Grocery", .001)]);
    const response = await discover(jsonRequest("/api/v2/stores", { mode: "live", location: { country: "CA", postalCode: "M5V 2T6" }, radiusKm: 5 }));
    const body = await response.json() as ApiResponse<StoreDiscoveryResultV2>;
    if (!body.ok) throw Error("Expected discovery result.");
    expect(body.data.selectedStoreIds).toEqual(["google:loblaws", "google:nofrills-a", "google:walmart-near"]);
    expect(body.data.stores.map(store => store.id)).toEqual(["google:loblaws", "google:nofrills-a", "google:walmart-near", "google:sobeys"]);
    expect(body.data.selection).toMatchObject({ strategy: "nearest-distinct-banners", limit: 3, candidateLimit: 20, exhaustive: false });
    expect(body.data.attributions).toHaveLength(1);
    expect(body.data.stores[0]).toMatchObject({ distanceMeters: expect.any(Number) });
    const nearby = JSON.parse(String(fetcher.mock.calls[1]![1]?.body)) as { rankPreference: string; maxResultCount: number };
    expect(nearby).toMatchObject({ rankPreference: "DISTANCE", maxResultCount: 20 });
  });
  it.each([0, 1, 2])("continues with %i eligible stores", async count => {
    google([place("a", "Loblaws", .01), place("b", "No Frills", .02)].slice(0, count));
    const result = await planned(await plan(jsonRequest("/api/v2/plan", input())));
    expect(result.selectedStoreIds).toHaveLength(count);
    expect(result.status).toBe(count ? "pricing-unavailable" : "no-stores");
    expect(result.discovery.selectedStoreIds).toEqual(result.selectedStoreIds);
  });
  it("preserves the closest US stores through missing pricing credentials instead of choosing a farther branch", async () => {
    const fetcher = google([place("near-kroger", "Kroger", .005, "US"), place("near-aldi", "ALDI", .01, "US"), place("near-walmart", "Walmart", .02, "US"), place("far-wegmans", "Wegmans", .03, "US")], "US");
    const result = await planned(await plan(jsonRequest("/api/v2/plan", input("US"))));
    expect(result.status).toBe("pricing-unavailable");
    expect(result.selectedStoreIds).toEqual(["google:near-kroger", "google:near-aldi", "google:near-walmart"]);
    expect(result.discovery.stores).toHaveLength(4);
    expect(result.pricingError).toMatchObject({ code: "provider-not-configured" });
    expect(result.optimization).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.discovery.stores.every(store => store.pricing.status === "unavailable")).toBe(true);
  });
  it("accepts an explicit eligible alternative and rejects an unrelated store override", async () => {
    google([place("loblaws", "Loblaws", .005), place("nofrills", "No Frills", .01), place("walmart", "Walmart", .02), place("sobeys", "Sobeys", .03)]);
    const result = await planned(await plan(jsonRequest("/api/v2/plan", { ...input(), storeIds: ["google:sobeys"] })));
    expect(result.selectedStoreIds).toEqual(["google:sobeys"]);
    expect(result.discovery.selectedStoreIds).toEqual(["google:loblaws", "google:nofrills", "google:walmart"]);
    expect((await plan(jsonRequest("/api/v2/plan", { ...input(), storeIds: ["google:unrelated"] }))).status).toBe(422);
  });
  it("keeps explicit CA/US sample journeys working without contacting external providers", async () => {
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    for (const country of ["CA", "US"] as const) {
      const result = await planned(await plan(jsonRequest("/api/v2/plan", { ...input(country), mode: "demo" })));
      expect(result.status).toBe("planned"); expect(result.optimization?.pricingBasis).toBe("illustrative");
      expect(result.selectedStoreIds).toHaveLength(3);
      expect(result.discovery.selection.strategy).toBe("demo-order");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates currency, exclusions, catalog revision and explicit mode before provider calls", async () => {
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    const request = input();
    for (const invalid of [{ ...request, mode: undefined }, { ...request, catalogVersion: "old" },
      { ...request, preferences: { ...request.preferences, weeklyBudget: { amountCents: 100, currency: "USD" } } },
      { ...request, preferences: { ...request.preferences, excludedIngredientIds: ["unknown-ingredient"] } }]) {
      expect((await plan(jsonRequest("/api/v2/plan", invalid))).status).toBe(422);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
