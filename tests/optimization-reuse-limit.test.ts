import { describe, expect, it } from "vitest";
import { getDemoStores } from "@/data/demo-stores";
import { ingredients } from "@/data/ingredients";
import { createPackageOptimizer } from "@/server/optimization/engine";
import type { MixedStorePlan, OptimizationRequest, Recipe } from "@/contracts";

describe("optional reuse comparison limits", () => {
  it("keeps a proven basket and mixed plan when only the separate-meal savings search is capped", async () => {
    const store = getDemoStores("CA")[0]!;
    const recipe: Recipe = { id: "one", name: "Synthetic rice", description: "Test only", servings: 1, totalMinutes: 1,
      ingredients: [{ ingredientId: "rice", quantity: 1, unit: "g" }], diets: [], allergens: [], steps: [],
      illustration: "grain-bowl", nutritionBasis: "estimated",
      nutritionPerServing: { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 } };
    const request: OptimizationRequest = { mode: "demo", country: "CA", storeIds: [store.id], preferences: {
      weeklyBudget: { amountCents: 100_000, currency: "CAD" }, mealCount: 2, servingsPerMeal: 1,
      dietaryRestrictions: [], excludedIngredientIds: [], excludedAllergens: [], nutritionPriorities: [], objective: "minimize-cost" } };
    const mixed: MixedStorePlan[] = [];
    const engine = createPackageOptimizer("illustrative", { ingredients, recipes: [recipe], onMixedPlan: plan => { if (plan) mixed.push(plan); } });
    const result = await engine(request, [store], async () => [{ storeId: store.id, packages:
      ([ ["a", .000003, 3], ["b", .000007, 7], ["c", 2, 100_000] ] as const).map(([id, quantity, amountCents]) => ({
        product: { id, ingredientId: "rice", name: id, label: "Synthetic only", countries: ["CA"], content: { quantity, unit: "g" } },
        price: { amountCents, currency: "CAD" },
      })) }]);
    expect(result).toMatchObject({ status: "feasible", optimality: "proven", total: { amountCents: 100_000 },
      budgetRemaining: { amountCents: 0 }, search: { exhaustive: true }, ingredientReuse: [] });
    expect(mixed[0]).toMatchObject({ optimality: "proven", total: { amountCents: 100_000 } });
    expect(result.notices.join(" ")).toContain("ingredient-reuse savings could not be calculated");
  });
});
