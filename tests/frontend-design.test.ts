import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OptimizationResult } from "@/contracts";
import { PlanResults } from "@/components/plan-results";
import { Homepage } from "@/components/homepage";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";
import { initialPlanner } from "@/lib/planner";
import { optimizationV2ViewSchema } from "@/lib/planner-api";
import { POST as optimize } from "@/app/api/v2/optimize/route";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { jsonRequest } from "./fixtures";

const props = { recipes, ingredients, products, stores: [], onEdit: () => undefined, onChooseStores: () => undefined };

describe("redesigned results retain product honesty", () => {
  it.each(["CA", "US"] as const)("keeps a real %s demo response illustrative with estimated nutrition and original artwork", async country => {
    const discovery = await demoStoreDiscovery.discover({ mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" }, radiusKm: 5 });
    const response = await optimize(jsonRequest("/api/v2/optimize", { catalogVersion: CATALOG_VERSION, mode: "demo", country,
      storeIds: [discovery.stores[0]!.id], preferences: { ...initialPlanner("demo", country).preferences, mealCount: 1 } }));
    expect(response.status).toBe(200);
    const result = optimizationV2ViewSchema.parse((await response.json()).data);
    expect(result.status).toBe("feasible");
    const html = renderToStaticMarkup(createElement(PlanResults, { ...props, stores: discovery.stores, result }));
    expect(html).toContain("Illustrative prices");
    expect(html).toContain(country === "CA" ? "CAD" : "USD");
    expect(html).toContain("Nutrition is estimated");
    expect(html).toContain('class="meal-art');
    expect(html).not.toMatch(/Verified quote|\/photos\//);
  });

  it("keeps a capped search distinct from a proven lack of matching plans", () => {
    const result: OptimizationResult = { mode: "demo", country: "CA", currency: "CAD", pricingBasis: "illustrative", notices: [],
      search: { evaluatedCombinations: 1, exhaustive: false }, status: "incomplete", reason: "search-limit", message: "Search limit reached." };
    const html = renderToStaticMarkup(createElement(PlanResults, { ...props, result }));
    expect(html).toContain("Search paused");
    expect(html).toContain("A plan may still be possible");
    expect(html).not.toContain("No matching plan");
  });

  it("shows missing pricing without inventing a zero-cost total", () => {
    const result: OptimizationResult = { mode: "demo", country: "CA", currency: "CAD", pricingBasis: "illustrative", notices: [],
      search: { evaluatedCombinations: 1, exhaustive: true }, status: "infeasible", reason: "pricing-unavailable", minimumKnownCost: null,
      message: "Prices are unavailable for the required ingredients." };
    const html = renderToStaticMarkup(createElement(PlanResults, { ...props, result }));
    expect(html).toContain(result.message);
    expect(html).toContain("Ingredient prices unavailable");
    expect(html).toContain("Choose other stores");
    expect(html).not.toContain("Edit preferences");
    expect(html).not.toMatch(/CAD|USD|Lowest known cost|Basket total/);
  });
});

describe("concise visual homepage", () => {
  it("keeps the visible copy under 70 words and omits star decorations", () => {
    const html = renderToStaticMarkup(createElement(Homepage));
    const words = html.replace(/<[^>]*>/g, " ").trim().split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(70);
    expect(html).not.toMatch(/[✳★✦✧✨]|hero-sticker|hero-note|sample-section/);
    expect(html).toContain("Pause grocery animation");
  });
});
