import { describe, expect, it } from "vitest";
import { currencyForCountry, type Diet, type Nutrition } from "@/contracts";
import { ingredients, ingredientById } from "@/data/ingredients";
import { recipes } from "@/data/recipes";
import { offers, pricingProfiles, products } from "@/data/pricing";

describe("curated catalog integrity", () => {
  it("contains 12–15 recipes with unique IDs throughout the catalog", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(12); expect(recipes.length).toBeLessThanOrEqual(15);
    for (const collection of [recipes, ingredients, products, pricingProfiles]) {
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length);
    }
    expect(new Set(offers.map((offer) => `${offer.profileId}/${offer.productId}`)).size).toBe(offers.length);
  });
  it.each(recipes)("validates ingredients, labels, and nutrition for $id", (recipe) => {
    expect(recipe.servings).toBeGreaterThan(0); expect(recipe.steps.length).toBeGreaterThanOrEqual(3);
    expect(recipe.nutritionBasis).toBe("estimated");
    expect(new Set(recipe.ingredients.map((line) => line.ingredientId)).size).toBe(recipe.ingredients.length);
    const allergens = new Set<string>();
    const totals: Nutrition = { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
    for (const line of recipe.ingredients) {
      const ingredient = ingredientById[line.ingredientId];
      expect(ingredient, `${recipe.id}: ${line.ingredientId}`).toBeDefined();
      if (!ingredient) throw new Error("Unknown ingredient");
      expect(line.quantity).toBeGreaterThan(0); expect(line.unit).toBe(ingredient.unit);
      if (line.unit === "each") expect(Number.isInteger(line.quantity)).toBe(true);
      for (const allergen of ingredient.allergens) allergens.add(allergen);
      for (const key of Object.keys(totals) as (keyof Nutrition)[]) {
        totals[key] += ingredient.nutrition.values[key] * line.quantity / ingredient.nutrition.basisQuantity / recipe.servings;
      }
    }
    expect(recipe.allergens).toEqual([...allergens].sort());
    for (const diet of ["vegetarian", "vegan", "gluten-free"] as Diet[]) {
      expect(recipe.diets.includes(diet)).toBe(recipe.ingredients.every((line) => ingredientById[line.ingredientId]!.diets.includes(diet)));
    }
    for (const key of Object.keys(totals) as (keyof Nutrition)[]) {
      expect(recipe.nutritionPerServing[key]).toBeCloseTo(totals[key], 0);
      expect(Number.isFinite(recipe.nutritionPerServing[key])).toBe(true);
      expect(recipe.nutritionPerServing[key]).toBeGreaterThanOrEqual(0);
    }
  });
  it("includes several vegan and gluten-free options", () => {
    expect(recipes.filter((recipe) => recipe.diets.includes("vegan") && recipe.diets.includes("gluten-free")).length).toBeGreaterThanOrEqual(5);
  });
  it("has country-compatible, positive, canonical packages for every ingredient", () => {
    for (const ingredient of ingredients) {
      for (const country of ["CA", "US"] as const) {
        const matching = products.filter((item) => item.ingredientId === ingredient.id && item.countries.includes(country));
        expect(matching.length).toBeGreaterThan(0);
        for (const product of matching) {
          expect(product.content.unit).toBe(ingredient.unit); expect(product.content.quantity).toBeGreaterThan(0);
          if (product.content.unit === "each") expect(Number.isInteger(product.content.quantity)).toBe(true);
        }
      }
    }
  });
  it("covers every package in every sample profile, with correctly labeled integer cents", () => {
    for (const profile of pricingProfiles) {
      expect(profile.currency).toBe(currencyForCountry(profile.country)); expect(profile.basis).toBe("illustrative");
      for (const product of products) {
        const quote = offers.find((offer) => offer.profileId === profile.id && offer.productId === product.id);
        expect(quote).toBeDefined();
        expect(quote?.price.currency).toBe(profile.currency); expect(quote?.basis).toBe("illustrative");
        expect(Number.isInteger(quote?.price.amountCents)).toBe(true); expect(quote!.price.amountCents).toBeGreaterThan(0);
      }
    }
    expect(offers.every((offer) => products.some((product) => product.id === offer.productId))).toBe(true);
  });
});
