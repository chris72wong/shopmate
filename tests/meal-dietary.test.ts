import { describe, expect, it } from "vitest";
import type { GeneratedMeal, MealGenerationRequest } from "@/contracts/meal-plan";
import { validateMealPreferences } from "@/server/meals/dietary";
import { ServiceError } from "@/server/errors";

const request: MealGenerationRequest = {
  location: { country: "CA", postalCode: "L2R 3M2" }, budget: { amountCents: 10_000, currency: "CAD" },
  householdSize: 2, mealCount: 1, dietaryRestrictions: [], excludedAllergens: [], highProtein: false, avoidMealNames: [], ingredientConventions: [],
};
function meal(names: string[], patch: Partial<GeneratedMeal> = {}): GeneratedMeal {
  return {
    id: "roasted-bowl", name: "Roasted bowl", description: "A warm grain bowl.", servings: 2,
    ingredients: names.map((name, index) => ({ id: `ingredient-${index}`, name, quantity: 100, unit: "g", preparation: "as-sold", category: "other" })),
    instructions: ["Prepare the ingredients.", "Combine and serve."], prepMinutes: 25, dietaryCategory: "omnivore", ...patch,
  };
}
function check(names: string[], patch: Partial<MealGenerationRequest>, mealPatch: Partial<GeneratedMeal> = {}) {
  return () => validateMealPreferences([meal(names, mealPatch)], { ...request, ...patch });
}

describe("generated meal dietary validation", () => {
  it.each(["chicken breast", "beef broth", "fish sauce", "anchovies", "gelatin", "lard", "shrimp", "bacon"])("rejects %s for vegetarians despite a misleading tag", name => {
    expect(check([name, "rice"], { dietaryRestrictions: ["vegetarian"] }, { dietaryCategory: "vegetarian" })).toThrow(ServiceError);
  });
  it.each(["milk", "eggs", "honey", "butter", "parmesan", "ghee", "whey protein", "mayonnaise"])("rejects %s for vegans", name => {
    expect(check([name, "rice"], { dietaryRestrictions: ["vegan"] }, { dietaryCategory: "vegan" })).toThrow(ServiceError);
  });
  it("allows plant substitutes and eggplant without losing soy/nut allergen checks", () => {
    const foods = ["coconut milk", "peanut butter", "vegan cheese", "eggplant", "plant-based chicken", "egg-free mayonnaise", "butter beans", "oyster mushrooms", "coconut butter", "cream of tartar"];
    expect(check(foods, { dietaryRestrictions: ["vegan"] }, { dietaryCategory: "vegan" })).not.toThrow();
    expect(check(["soy milk", "rice"], { excludedAllergens: ["soy"] })).toThrow(ServiceError);
    expect(check(["almond milk", "rice"], { excludedAllergens: ["tree-nuts"] })).toThrow(ServiceError);
    expect(check(["peanut butter", "rice"], { excludedAllergens: ["peanuts"] })).toThrow(ServiceError);
  });
  it.each(["wheat pasta", "barley", "couscous", "soy sauce", "flour", "bread"])("rejects likely gluten source %s", name => {
    expect(check([name, "rice"], { dietaryRestrictions: ["gluten-free"] })).toThrow(ServiceError);
  });
  it("accepts explicit gluten-free substitutes and tamari", () => {
    expect(check(["gluten-free pasta", "rice noodles", "corn tortillas", "almond flour", "tamari"], { dietaryRestrictions: ["gluten-free"] })).not.toThrow();
  });
  it.each([
    ["milk", "cream"], ["egg", "eggs"], ["fish", "fish sauce"], ["shellfish", "shrimp"], ["tree-nuts", "cashews"],
    ["peanuts", "peanut butter"], ["wheat", "wheat flour"], ["soy", "tofu"], ["sesame", "tahini"],
  ] as const)("rejects excluded %s in %s", (allergen, name) => {
    expect(check([name, "rice"], { excludedAllergens: [allergen] })).toThrow(ServiceError);
  });
  it("checks instructions for undeclared animal additions", () => {
    expect(check(["rice", "carrot"], { dietaryRestrictions: ["vegetarian"] }, { dietaryCategory: "vegetarian", instructions: ["Cook rice.", "Add chicken broth."] })).toThrow(ServiceError);
  });
  it("does not mistake oyster mushrooms for shellfish", () => {
    expect(check(["king oyster mushrooms", "rice"], { excludedAllergens: ["shellfish"] })).not.toThrow();
  });
  it("does not hide an explicit dairy addition behind declared plant milk", () => {
    expect(check(["coconut milk", "rice"], { dietaryRestrictions: ["vegan"] }, { dietaryCategory: "vegan", instructions: ["Cook rice.", "Add cow's milk."] })).toThrow(ServiceError);
  });
  it("allows shorthand instructions referring to declared compliant alternatives", () => {
    expect(check(["gluten-free pasta", "coconut milk"], { dietaryRestrictions: ["gluten-free", "vegan"] }, { dietaryCategory: "vegan", instructions: ["Cook pasta.", "Add milk and simmer."] })).not.toThrow();
  });
  it("rejects a wrong dietary category", () => {
    expect(check(["rice", "carrot"], { dietaryRestrictions: ["vegan"] })).toThrow(ServiceError);
  });
  it("enforces serving and meal counts", () => {
    expect(check(["rice", "carrot"], {}, { servings: 4 })).toThrow(ServiceError);
    expect(check(["rice", "carrot"], { mealCount: 3 })).toThrow(ServiceError);
  });
  it("rejects repeated IDs or normalized names and avoided names", () => {
    const first = meal(["rice", "carrot"]);
    expect(() => validateMealPreferences([first, { ...first, name: "Different bowl" }], { ...request, mealCount: 2 })).toThrow(ServiceError);
    expect(() => validateMealPreferences([first, { ...first, id: "another-bowl", name: "  ROASTED bowl " }], { ...request, mealCount: 2 })).toThrow(ServiceError);
    expect(check(["rice", "carrot"], { avoidMealNames: ["  ROASTED BOWL  "] })).toThrow(ServiceError);
  });
  it("returns only a sanitized provider error", () => {
    try { check(["chicken", "rice"], { dietaryRestrictions: ["vegetarian"] }, { dietaryCategory: "vegetarian" })(); }
    catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      const failure = error as ServiceError;
      expect(failure.status).toBe(502);
      expect(failure.error.code).toBe("provider-error");
      expect(failure.message).not.toContain("chicken");
    }
  });
});
