import type { OptimizationRequest } from "@/contracts";

export function optimizationRequest(): OptimizationRequest {
  return {
    mode: "demo", country: "CA", storeIds: ["demo-ca-clover"],
    preferences: {
      weeklyBudget: { amountCents: 8000, currency: "CAD" }, mealCount: 5, servingsPerMeal: 2,
      dietaryRestrictions: ["vegetarian"], excludedIngredientIds: [], excludedAllergens: [],
      nutritionPriorities: ["high-protein"], objective: "balanced",
    },
  };
}
export function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
