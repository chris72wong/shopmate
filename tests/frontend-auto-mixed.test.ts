// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MixedStorePlan, OptimizationResultV2, PricingResultV2 } from "@/contracts";
import { PlanResults } from "@/components/plan-results";
import { ingredients } from "@/data/ingredients";
import { recipes } from "@/data/recipes";
import { products } from "@/data/pricing";
import { initialPlanner, plannerReducer } from "@/lib/planner";
import { discoveryV2ViewSchema, optimizationV2ViewSchema, planV2MatchesRequest } from "@/lib/planner-api";
import { POST as discover } from "@/app/api/v2/stores/route";
import { POST as price } from "@/app/api/v2/pricing/route";
import { POST as optimize } from "@/app/api/v2/optimize/route";
import { createPackageOptimizer, DEFAULT_EVALUATION_LIMIT, OPTIMIZER_VERSION } from "@/server/optimization/engine";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { jsonRequest } from "./fixtures";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; host.remove(); vi.restoreAllMocks(); });

async function context(country: "CA" | "US" = "CA") {
  const response = await discover(jsonRequest("/api/v2/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" } }));
  const discovery = discoveryV2ViewSchema.parse((await response.json()).data);
  const input = { mode: "demo" as const, country, storeIds: discovery.selectedStoreIds, catalogVersion: CATALOG_VERSION,
    preferences: { ...initialPlanner("demo", country).preferences, mealCount: 1, objective: "minimize-cost" as const } };
  return { discovery, input };
}
async function splitPlan() {
  const { discovery, input } = await context();
  const { preferences: _preferences, ...selection } = input;
  void _preferences;
  const pricingResponse = await price(jsonRequest("/api/v2/pricing", selection));
  expect(pricingResponse.status).toBe(200);
  const pricing: PricingResultV2 = (await pricingResponse.json()).data;
  const recipe = recipes.find(recipe => recipe.id === "chickpea-rice-bowl")!;
  // Split the actual demo offers into complementary coverage. These remain illustrative.
  pricing.stores = pricing.stores.map((store, index) => {
    if (store.status !== "available" || store.basis !== "illustrative") throw Error("Expected demo offers");
    const covered = recipe.ingredients.filter((_, ingredientIndex) => ingredientIndex % 3 === index).map(item => item.ingredientId);
    const offers = store.offers.filter(offer => covered.includes(products.find(product => product.id === offer.productId)!.ingredientId));
    return { ...store, offers, missingIngredientIds: ingredients.filter(item => !covered.includes(item.id)).map(item => item.id).sort() };
  });
  let mixedStorePlan: MixedStorePlan | null = null;
  const engine = createPackageOptimizer("illustrative", { recipes: [recipe], onMixedPlan: plan => { mixedStorePlan = plan; } });
  const stores = discovery.stores.map(store => {
    if (store.source !== "demo" || store.pricing.status !== "illustrative") throw Error("Expected fictional stores");
    return { ...store, pricing: store.pricing };
  });
  const { catalogVersion: _version, ...engineInput } = input;
  void _version;
  const result = await engine(engineInput, stores, async () => pricing.stores.map(store => ({ storeId: store.storeId,
    packages: store.status === "available" && store.basis === "illustrative" ? store.offers.map(offer => ({ product: products.find(product => product.id === offer.productId)!, price: offer.price })) : [] })));
  const full: OptimizationResultV2 = { ...result, mixedStorePlan, pricing, catalogVersion: CATALOG_VERSION, optimizerVersion: OPTIMIZER_VERSION,
    search: { ...result.search, evaluationLimit: DEFAULT_EVALUATION_LIMIT, candidateRecipeIds: [recipe.id] } };
  return { result: optimizationV2ViewSchema.parse(full), discovery, input };
}
async function mount(result: OptimizationResultV2, stores: Awaited<ReturnType<typeof context>>["discovery"]["stores"]) {
  document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(createElement(PlanResults, { result, stores, recipes, ingredients, products, onEdit: vi.fn(), onChooseStores: vi.fn() })));
}
async function button(label: string) {
  const control = [...host.querySelectorAll("button")].find(button => button.textContent?.startsWith(label));
  if (!control) throw Error(`Missing button: ${label}`);
  await act(async () => control.click());
}

describe("automatic selection and mixed plans in the integrated frontend", () => {
  it.each(["CA", "US"] as const)("uses all three %s automatic selections while retaining explicit overrides", async country => {
    const { discovery } = await context(country);
    const state = plannerReducer(initialPlanner("demo", country), { type: "discovery", data: discovery });
    expect(state.storeIds).toEqual(discovery.selectedStoreIds);
    expect(state.storeIds).toHaveLength(3);
    expect(plannerReducer(state, { type: "store", id: state.storeIds[0]! }).storeIds).toHaveLength(2);
    expect(discovery.selection.distanceBasis).toBeNull();
    expect(discoveryV2ViewSchema.safeParse({ ...discovery, selectedStoreIds: ["unrelated"] }).success).toBe(false);
    expect(discoveryV2ViewSchema.safeParse({ ...discovery, selectedStoreIds: [state.storeIds[0], state.storeIds[0]] }).success).toBe(false);
  });
  it("renders recipes for a complete split basket even when every single-store basket is incomplete", async () => {
    const { result, discovery, input } = await splitPlan();
    expect(result.status).toBe("infeasible"); expect(result).not.toHaveProperty("total");
    expect(planV2MatchesRequest(result, input)).toBe(true);
    await mount(result, discovery.stores);
    expect(host.textContent).toContain("Across-store total");
    expect(host.textContent).toContain("Illustrative prices");
    expect(host.textContent).not.toContain("Ingredient prices unavailable");
    expect(host.querySelectorAll(".meal-detail")).toHaveLength(1);
    await button("Stores");
    expect(host.querySelectorAll(".basket-row")).toHaveLength(3);
    expect(host.textContent).toContain("only the items assigned to that store");
    expect(host.textContent).not.toContain("Lowest complete basket");
    await button("Shopping list");
    expect(host.querySelectorAll(".grocery-item")).toHaveLength(6);
    for (const store of discovery.stores) expect(host.textContent).toContain(store.name);
    await button("Package details");
    expect(host.textContent).toContain("leftover");
    const checkbox = host.querySelector<HTMLInputElement>('.grocery-line input')!;
    const checkedStoreName = checkbox.closest("label")!.querySelector("small")!.textContent;
    const checkedStoreId = discovery.stores.find(store => store.name === checkedStoreName)!.id;
    await act(async () => checkbox.click());
    expect(host.textContent).toContain("1/6 done");
    const select = host.querySelector("select")!;
    await act(async () => { select.value = checkedStoreId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelectorAll(".grocery-item")).toHaveLength(2);
    expect(host.textContent).toContain("assigned subtotal");
    expect(host.textContent).toContain("1/2 done");
    const checkedItem = host.querySelector<HTMLInputElement>('.grocery-line input:checked')!;
    expect(checkedItem).not.toBeNull();
    await act(async () => checkedItem.click());
    await act(async () => { select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("0/6 done");
    expect(host.querySelectorAll('.grocery-line input:checked')).toHaveLength(0);
  });
  it("rejects mixed plans with unrelated branches, currency, totals, missing oil or false proof", async () => {
    const { result, input } = await splitPlan();
    const plan = result.mixedStorePlan!;
    const invalid = [
      { ...plan, total: { ...plan.total, currency: "USD" as const } },
      { ...plan, budgetRemaining: { ...plan.budgetRemaining, amountCents: 1 } },
      { ...plan, lines: plan.lines.filter(line => line.ingredientId !== "olive-oil") },
      { ...plan, lines: plan.lines.map((line, index) => index ? line : { ...line, storeId: "unrelated" }) },
      { ...plan, lines: plan.lines.map((line, index) => index ? line : { ...line, subtotal: { ...line.subtotal, amountCents: 1 } }) },
    ];
    for (const mixedStorePlan of invalid) expect(planV2MatchesRequest({ ...result, mixedStorePlan }, input)).toBe(false);
    expect(planV2MatchesRequest({ ...result, search: { ...result.search, exhaustive: false } }, input)).toBe(false);
  });
  it("switches complete strategies without keeping the other plan's shopping list", async () => {
    const { discovery, input } = await context("US");
    const response = await optimize(jsonRequest("/api/v2/optimize", input));
    const result = optimizationV2ViewSchema.parse((await response.json()).data);
    await mount(result, discovery.stores);
    expect(host.textContent).toContain("Basket total");
    await button("Across stores"); expect(host.textContent).toContain("Across-store total");
    await button("Shopping list"); expect(host.querySelector("select")?.value).toBe("all");
    expect(host.textContent).toContain("USD"); expect(host.textContent).not.toContain("Verified quote");
    await button("One store"); expect(host.textContent).toContain("Basket total");
  });
});
