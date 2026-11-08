import { describe, expect, it } from "vitest";
import { initialPlanner, plannerReducer } from "@/lib/planner";
import { pricingMatchesRequest, pricingViewSchema } from "@/lib/planner-api";
import { POST as discover } from "@/app/api/v2/stores/route";
import { POST as pricing } from "@/app/api/v2/pricing/route";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { jsonRequest } from "./fixtures";

describe("merged frontend pricing flow", () => {
  it.each(["CA", "US"] as const)("checks %s sample prices and clears them when dependencies change", async country => {
    const response = await discover(jsonRequest("/api/v2/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" } }));
    const data = (await response.json()).data;
    let state = plannerReducer(initialPlanner("demo", country), { type: "discovery", data });
    state = plannerReducer(state, { type: "store", id: data.stores[0].id });
    const selection = { mode: state.mode, country, storeIds: state.storeIds, catalogVersion: CATALOG_VERSION };
    const priced = await pricing(jsonRequest("/api/v2/pricing", selection));
    const quote = pricingViewSchema.parse((await priced.json()).data);
    expect(pricingMatchesRequest(quote, selection)).toBe(true);
    expect(pricingMatchesRequest({ ...quote, catalogVersion: "stale" }, selection)).toBe(false);
    expect(pricingMatchesRequest({ ...quote, mode: "live" }, selection)).toBe(false);
    expect(pricingMatchesRequest({ ...quote, currency: country === "CA" ? "USD" : "CAD" }, selection)).toBe(false);
    state = plannerReducer(state, { type: "pricing", data: quote });
    expect(state.pricing).toEqual(quote);
    expect(plannerReducer(state, { type: "store", id: data.stores[0].id }).pricing).toBeNull();
    expect(plannerReducer(state, { type: "country", country: country === "CA" ? "US" : "CA" }).pricing).toBeNull();
    expect(plannerReducer(state, { type: "location", postalCode: "", radiusKm: 10 }).pricing).toBeNull();
  });
});
