import { z } from "zod";
import { allergenSchema, currencyForCountry, dietSchema, locationInputSchema, moneySchema } from "./schemas";

export const mealIngredientSchema = z.strictObject({
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().min(0.001).max(100_000),
  unit: z.enum(["g", "ml", "each"]),
  preparation: z.enum(["dry", "drained", "edible", "as-sold"]),
  category: z.enum(["produce", "protein", "grains", "dairy", "pantry", "other"]),
});
export const generatedMealSchema = z.strictObject({
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(1).max(300),
  servings: z.number().int().min(1).max(8),
  ingredients: z.array(mealIngredientSchema).min(2).max(25),
  instructions: z.array(z.string().trim().min(1).max(600)).min(2).max(12),
  prepMinutes: z.number().int().min(5).max(180),
  dietaryCategory: z.enum(["omnivore", "vegetarian", "vegan"]),
});
export const mealGenerationRequestSchema = z.strictObject({
  location: locationInputSchema,
  budget: moneySchema.extend({ amountCents: z.number().int().min(100).max(1_000_000) }),
  householdSize: z.number().int().min(1).max(8),
  mealCount: z.number().int().min(1).max(7),
  dietaryRestrictions: z.array(dietSchema).max(3),
  excludedAllergens: z.array(allergenSchema).max(9),
  highProtein: z.boolean(),
  avoidMealNames: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  ingredientConventions: z.array(mealIngredientSchema.omit({ quantity: true })).max(175).default([]),
}).superRefine((input, context) => {
  if (input.budget.currency !== currencyForCountry(input.location.country)) context.addIssue({
    code: "custom", path: ["budget", "currency"], message: "Budget currency must match the selected country.",
  });
});
export const mealPlanResultSchema = z.strictObject({
  source: z.literal("gemini"),
  model: z.literal("gemini-3.5-flash-lite"),
  meals: z.array(generatedMealSchema).min(1).max(7),
  notices: z.array(z.string()),
});
export type MealIngredient = z.infer<typeof mealIngredientSchema>;
export type GeneratedMeal = z.infer<typeof generatedMealSchema>;
export type MealGenerationRequest = z.infer<typeof mealGenerationRequestSchema>;
export type MealPlanResult = z.infer<typeof mealPlanResultSchema>;
