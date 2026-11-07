import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as discover } from "@/app/api/stores/route";
import { POST as optimize } from "@/app/api/optimize/route";
import { GET as health } from "@/app/api/health/route";
import { jsonRequest, optimizationRequest } from "./fixtures";

describe("API route contracts", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());
  it("reports only implemented capabilities", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect((await response.json()).data.capabilities).toEqual({ demoDiscovery: true, liveDiscovery: true, optimization: true });
  });
  it.each(["CA", "US"])("serves explicit %s demo discovery without credentials", async (country) => {
    const response = await discover(jsonRequest("/api/stores", { mode: "demo", location: {
      country, postalCode: country === "CA" ? "m5v2t6" : "02108",
    } }));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-ShopMate-Contract-Version")).toBe("1");
    const body = await response.json();
    expect(body.ok).toBe(true); expect(body.data.mode).toBe("demo");
    expect(body.data.location.currency).toBe(country === "CA" ? "CAD" : "USD");
  });
  it("never silently substitutes demo results for live discovery", async () => {
    const response = await discover(jsonRequest("/api/stores", { mode: "live", location: { country: "US", postalCode: "14201" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "provider-not-configured" } });
  });
  it.each([discover, optimize])("rejects malformed JSON", async (handler) => {
    const response = await handler(new Request("http://localhost/api", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-json" } });
  });
  it("returns field paths for validation errors", async () => {
    const response = await discover(jsonRequest("/api/stores", { mode: "demo", location: { country: "CA", postalCode: "wrong" } }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-request", details: [{ path: "location.postalCode" }] } });
  });
  it("optimizes the sample catalog and still validates input first", async () => {
    const valid = await optimize(jsonRequest("/api/optimize", optimizationRequest()));
    expect(valid.status).toBe(200); expect(await valid.json()).toMatchObject({ ok: true, data: { status: "feasible", pricingBasis: "illustrative" } });
    const invalid = await optimize(jsonRequest("/api/optimize", { ...optimizationRequest(), storeIds: [] }));
    expect(invalid.status).toBe(422);
  });
  it.each(["CA", "US"] as const)("runs an actual %s discovery-selection-optimization route journey", async country => {
    const discovery = await discover(jsonRequest("/api/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 5 }));
    const stores = (await discovery.json()).data.stores as { id: string }[];
    const input = optimizationRequest(); input.country = country; input.storeIds = stores.map(store => store.id);
    input.preferences.weeklyBudget.currency = country === "CA" ? "CAD" : "USD";
    input.preferences.mealCount = 3;
    const response = await optimize(jsonRequest("/api/optimize", input));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { data } = await response.json();
    expect(data.status).toBe("feasible"); expect(data.baskets).toHaveLength(3);
    expect(data.total.amountCents).toBeLessThanOrEqual(input.preferences.weeklyBudget.amountCents);
    expect(data.total.amountCents + data.budgetRemaining.amountCents).toBe(input.preferences.weeklyBudget.amountCents);
    expect(data.meals).toHaveLength(3); expect(data.notices.join(" ")).toContain("fictional");
  });
  it.each([
    { ...optimizationRequest(), storeIds: ["demo-ca-unknown"] },
    { ...optimizationRequest(), preferences: { ...optimizationRequest().preferences, excludedIngredientIds: ["unknown-ingredient"] } },
  ])("rejects unknown server identities with useful field errors", async input => {
    const response = await optimize(jsonRequest("/api/optimize", input));
    expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-request", details: expect.any(Array) } });
  });
  it("keeps a missing live provider unavailable during optimization", async () => {
    const input = { ...optimizationRequest(), mode: "live", storeIds: ["google:synthetic"] };
    const response = await optimize(jsonRequest("/api/optimize", input));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ ok: false, error: { code: "provider-not-configured" } });
  });
});
