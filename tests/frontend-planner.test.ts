import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetCents, initialPlanner, plannerReducer, safeExternalUrl, toggleValue } from "@/lib/planner";
import type { PlannerState } from "@/lib/planner";
import { discoveryViewSchema, optimizationViewSchema, planMatchesRequest, postPlanner } from "@/lib/planner-api";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import type { FeasibleOptimization, OptimizationRequest, OptimizationResult } from "@/contracts";
import { optimizationRequestSchema } from "@/contracts";

const discovery = await demoStoreDiscovery.discover({ mode: "demo", location: { country: "CA", postalCode: "M5V 2T6" }, radiusKm: 5 });
const request: OptimizationRequest = { mode: "demo", country: "CA", storeIds: [discovery.stores[0]!.id], preferences: { ...initialPlanner().preferences, mealCount: 1 } };
// Synthetic transport fixture only. Never imported into the application or served as a plan.
const feasible: FeasibleOptimization = { mode: "demo", country: "CA", currency: "CAD", pricingBasis: "illustrative", status: "feasible", optimality: "best-found",
  search: { evaluatedCombinations: 1, exhaustive: false }, notices: [], meals: [{ slot: 0, recipeId: "banana-peanut-oats", servings: 2 }], requirements: [],
  estimatedTotalNutrition: { caloriesKcal: 800, proteinG: 20, carbsG: 100, fatG: 20, fiberG: 10 },
  baskets: [{ status: "complete", storeId: discovery.stores[0]!.id, lines: [], total: { amountCents: 1000, currency: "CAD" }, basis: "illustrative" }],
  recommendedStoreId: discovery.stores[0]!.id, total: { amountCents: 1000, currency: "CAD" }, budgetRemaining: { amountCents: 7000, currency: "CAD" }, ingredientReuse: [], basketSavings: null, explanations: [] };

afterEach(() => vi.unstubAllGlobals());

describe("frontend journey state", () => {
  it("starts live and makes demo an explicit separate choice", () => {
    expect(initialPlanner().mode).toBe("live"); expect(initialPlanner().step).toBe(1);
    expect(initialPlanner("demo", "US")).toMatchObject({ mode: "demo", country: "US", step: 1, preferences: { weeklyBudget: { currency: "USD" } } });
  });
  it("keeps preferences and location when going back", () => {
    let state = initialPlanner("demo", "CA");
    state = plannerReducer(state, { type: "location", postalCode: "M5V 2T6", radiusKm: 10 });
    state = plannerReducer(state, { type: "preferences", preferences: { ...state.preferences, servingsPerMeal: 4, excludedAllergens: ["peanuts"] } });
    state = plannerReducer(state, { type: "step", step: 4 });
    state = plannerReducer(state, { type: "step", step: 1 });
    expect(state.postalCode).toBe("M5V 2T6"); expect(state.preferences.servingsPerMeal).toBe(4); expect(state.preferences.excludedAllergens).toEqual(["peanuts"]);
  });
  it("clears country-dependent stores/results and replaces currency without conversion", () => {
    const state = { ...initialPlanner("demo", "CA"), postalCode: "M5V 2T6", discovery, storeIds: [discovery.stores[0]!.id], result: feasible };
    const changed = plannerReducer(state, { type: "country", country: "US" });
    expect(changed).toMatchObject({ country: "US", postalCode: "", discovery: null, storeIds: [], result: null, preferences: { weeklyBudget: { amountCents: 8000, currency: "USD" } } });
  });
  it("clears discovered stores on postal code or radius edits", () => {
    const state = { ...initialPlanner("demo", "CA"), discovery, storeIds: [discovery.stores[0]!.id], result: feasible };
    expect(plannerReducer(state, { type: "location", postalCode: "K1A 0B1", radiusKm: 25 })).toMatchObject({ discovery: null, storeIds: [], result: null });
  });
  it("selects and deselects only returned stores and limits comparison to three", () => {
    const fourth = { ...discovery.stores[0]!, id: "demo-ca-fourth" };
    let state: PlannerState = { ...initialPlanner("demo", "CA"), discovery: { ...discovery, stores: [...discovery.stores, fourth] } };
    state = plannerReducer(state, { type: "store", id: "invented-id" }); expect(state.storeIds).toEqual([]);
    for (const store of discovery.stores) state = plannerReducer(state, { type: "store", id: store.id });
    state = plannerReducer(state, { type: "store", id: fourth.id }); expect(state.storeIds).toHaveLength(3);
    state = plannerReducer(state, { type: "store", id: discovery.stores[0]!.id }); expect(state.storeIds).toHaveLength(2);
    state = plannerReducer(state, { type: "store", id: fourth.id }); expect(state.storeIds).toContain(fourth.id);
  });
  it("clears results when preferences or selected stores change", () => {
    const state = { ...initialPlanner("demo", "CA"), discovery, storeIds: [discovery.stores[0]!.id], result: feasible };
    expect(plannerReducer(state, { type: "store", id: discovery.stores[1]!.id }).result).toBeNull();
    expect(plannerReducer(state, { type: "preferences", preferences: { ...state.preferences, mealCount: 7 } }).result).toBeNull();
  });
  it("produces an API-valid request with canonical exclusions and money in cents", () => {
    let state = plannerReducer(initialPlanner("demo", "CA"), { type: "discovery", data: discovery });
    state = plannerReducer(state, { type: "store", id: discovery.stores[0]!.id });
    state = plannerReducer(state, { type: "preferences", preferences: { ...state.preferences, weeklyBudget: { amountCents: budgetCents("87.35")!, currency: "CAD" }, excludedIngredientIds: ["peanut-butter"], excludedAllergens: ["peanuts"], dietaryRestrictions: ["vegan"], nutritionPriorities: ["high-protein"] } });
    expect(optimizationRequestSchema.safeParse({ mode: state.mode, country: state.country, storeIds: state.storeIds, preferences: state.preferences }).success).toBe(true);
  });
  it.each([["80", 8000], ["0.01", 1], ["10.29", 1029], ["10000.00", 1000000], ["0", null], ["-1", null], ["10000.01", null], ["1.234", null], ["1e2", null], ["", null]] as const)("validates budget %s without floating point rounding", (input, expected) => expect(budgetCents(input)).toBe(expected));
  it("keeps hard exclusions unique while toggling", () => { expect(toggleValue(["peanuts"], "peanuts")).toEqual([]); expect(toggleValue(["milk"], "peanuts")).toEqual(["milk", "peanuts"]); });
  it("allows safe public HTTPS links only", () => { expect(safeExternalUrl("https://maps.google.com/?q=grocer")).toBeTruthy(); expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined(); expect(safeExternalUrl("http://example.com")).toBeUndefined(); });
});

describe("frontend API boundary", () => {
  it("submits the payload to the agreed same-origin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, data: discovery })); vi.stubGlobal("fetch", fetchMock);
    expect(await postPlanner("/api/stores", { mode: "demo" }, discoveryViewSchema, new AbortController().signal)).toEqual(discovery);
    expect(fetchMock).toHaveBeenCalledOnce(); expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/stores");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", cache: "no-store", body: '{"mode":"demo"}' });
  });
  it.each(["not-implemented", "provider-not-configured", "rate-limited", "not-found", "provider-error"])("preserves %s without falling back to demo", async code => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: false, error: { code, message: "Unavailable" } }, { status: code === "not-implemented" ? 501 : 503 })); vi.stubGlobal("fetch", fetchMock);
    await expect(postPlanner("/api/stores", { mode: "live" }, discoveryViewSchema, new AbortController().signal)).rejects.toMatchObject({ code }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("accepts a valid empty store search", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: { ...discovery, stores: [] } }))); expect((await postPlanner("/api/stores", {}, discoveryViewSchema, new AbortController().signal)).stores).toEqual([]); });
  it("rejects malformed success and non-JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: { stores: [] } })));
    await expect(postPlanner("/api/stores", {}, discoveryViewSchema, new AbortController().signal)).rejects.toMatchObject({ code: "invalid-response" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<h1>Error</h1>", { status: 502 })));
    await expect(postPlanner("/api/stores", {}, discoveryViewSchema, new AbortController().signal)).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("reports network failures and keeps deliberate cancellation separate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(postPlanner("/api/stores", {}, discoveryViewSchema, new AbortController().signal)).rejects.toMatchObject({ code: "network" });
    const controller = new AbortController(); controller.abort();
    await expect(postPlanner("/api/stores", {}, discoveryViewSchema, controller.signal)).rejects.toBeInstanceOf(TypeError);
  });
  it("accepts all three optimization variants and rejects a partial basket presented as complete", () => {
    const incomplete: OptimizationResult = { mode: "demo", country: "CA", currency: "CAD", pricingBasis: "illustrative", notices: [], search: { evaluatedCombinations: 10, exhaustive: false }, status: "incomplete", reason: "search-limit", message: "Search limit reached" };
    expect(optimizationViewSchema.safeParse(incomplete).success).toBe(true); expect(planMatchesRequest(incomplete, request)).toBe(true);
    const infeasible: OptimizationResult = { ...incomplete, status: "infeasible", reason: "budget", minimumKnownCost: null, search: { evaluatedCombinations: 10, exhaustive: true } };
    expect(optimizationViewSchema.safeParse(infeasible).success).toBe(true); expect(planMatchesRequest(infeasible, request)).toBe(true);
    expect(optimizationViewSchema.safeParse(feasible).success).toBe(true);
    expect(optimizationViewSchema.safeParse({ ...feasible, baskets: [{ status: "complete", storeId: request.storeIds[0] }] }).success).toBe(false);
  });
  it("rejects changed currencies, unrelated baskets, budget mismatches, and false exhaustive claims", () => {
    expect(planMatchesRequest(feasible, request)).toBe(true);
    expect(planMatchesRequest({ ...feasible, total: { amountCents: 1000, currency: "USD" } }, request)).toBe(false);
    expect(planMatchesRequest({ ...feasible, baskets: [] }, request)).toBe(false);
    expect(planMatchesRequest({ ...feasible, meals: [] }, request)).toBe(false);
    expect(planMatchesRequest({ ...feasible, budgetRemaining: { amountCents: 7001, currency: "CAD" } }, request)).toBe(false);
    expect(planMatchesRequest({ ...feasible, optimality: "proven" }, request)).toBe(false);
  });
});
