import type { Allergen, Diet, Ingredient, IngredientCategory, Nutrition, Unit } from "@/contracts";

const plantDiets: Diet[] = ["vegetarian", "vegan", "gluten-free"];
const vegetarianDiets: Diet[] = ["vegetarian", "gluten-free"];
type NutritionTuple = [kcal: number, protein: number, carbs: number, fat: number, fiber: number];

function ingredient(
  id: string, name: string, category: IngredientCategory, unit: Unit,
  values: NutritionTuple, diets: Diet[] = plantDiets, allergens: Allergen[] = [],
): Ingredient {
  const [caloriesKcal, proteinG, carbsG, fatG, fiberG] = values;
  const nutrition: Nutrition = { caloriesKcal, proteinG, carbsG, fatG, fiberG };
  return { id, name, category, unit, diets, allergens,
    nutrition: { basisQuantity: unit === "each" ? 1 : 100, values: nutrition, basis: "estimated" } };
}

/** Project-authored educational estimates, not verified product nutrition. See data/README.md. */
export const ingredients: Ingredient[] = [
  ingredient("oats", "Certified gluten-free rolled oats (dry)", "grains", "g", [380, 13, 68, 7, 10]),
  ingredient("milk", "Milk", "dairy", "ml", [50, 3.4, 5, 2, 0], vegetarianDiets, ["milk"]),
  ingredient("banana", "Banana (edible portion)", "produce", "g", [89, 1.1, 23, 0.3, 2.6]),
  ingredient("yogurt", "Plain Greek yogurt", "dairy", "g", [73, 10, 4, 2, 0], vegetarianDiets, ["milk"]),
  ingredient("chickpeas", "Chickpeas (canned, drained)", "proteins", "g", [140, 7, 22, 2, 6]),
  ingredient("rice", "Brown rice (dry)", "grains", "g", [370, 7.5, 77, 2.8, 3.5]),
  ingredient("spinach", "Spinach", "produce", "g", [23, 2.9, 3.6, 0.4, 2.2]),
  ingredient("tomato", "Tomatoes", "produce", "g", [18, 0.9, 3.9, 0.2, 1.2]),
  ingredient("cucumber", "Cucumber", "produce", "g", [15, 0.7, 3.6, 0.1, 0.5]),
  ingredient("olive-oil", "Olive oil", "pantry", "ml", [810, 0, 0, 90, 0]),
  ingredient("lemon-juice", "Lemon juice", "pantry", "ml", [22, 0.4, 7, 0.2, 0.3]),
  ingredient("lentils", "Red lentils (dry)", "proteins", "g", [350, 25, 60, 1.5, 11]),
  ingredient("carrot", "Carrots", "produce", "g", [41, 0.9, 10, 0.2, 2.8]),
  ingredient("onion", "Onions", "produce", "g", [40, 1.1, 9.3, 0.1, 1.7]),
  ingredient("black-beans", "Black beans (canned, drained)", "proteins", "g", [130, 8, 23, 0.5, 7]),
  ingredient("corn", "Corn (canned, drained)", "produce", "g", [85, 3, 19, 1, 2]),
  ingredient("bell-pepper", "Bell peppers", "produce", "g", [31, 1, 6, 0.3, 2.1]),
  ingredient("tortilla", "Wheat tortillas", "grains", "each", [140, 4, 24, 3.5, 2], ["vegetarian", "vegan"], ["wheat"]),
  ingredient("pasta", "Wheat pasta (dry)", "grains", "g", [360, 13, 72, 1.5, 3], ["vegetarian", "vegan"], ["wheat"]),
  ingredient("chicken", "Chicken breast (raw)", "proteins", "g", [120, 23, 0, 2.6, 0], ["gluten-free"]),
  ingredient("egg", "Large eggs", "proteins", "each", [72, 6.3, 0.4, 4.8, 0], vegetarianDiets, ["egg"]),
  ingredient("tofu", "Firm tofu", "proteins", "g", [120, 13, 3, 7, 1], plantDiets, ["soy"]),
  ingredient("broccoli", "Broccoli", "produce", "g", [34, 2.8, 6.6, 0.4, 2.6]),
  ingredient("peanut-butter", "Peanut butter", "pantry", "g", [590, 25, 20, 50, 6], plantDiets, ["peanuts"]),
  ingredient("potato", "Potatoes", "produce", "g", [77, 2, 17, 0.1, 2.2]),
  ingredient("cheddar", "Cheddar", "dairy", "g", [400, 25, 1.3, 33, 0], vegetarianDiets, ["milk"]),
  ingredient("quinoa", "Quinoa (dry)", "grains", "g", [370, 14, 64, 6, 7]),
  ingredient("canned-tomatoes", "Canned diced tomatoes", "pantry", "g", [24, 1.2, 5, 0.2, 1.5]),
  ingredient("garlic", "Garlic", "produce", "g", [149, 6.4, 33, 0.5, 2.1]),
  ingredient("soy-sauce", "Soy sauce", "pantry", "ml", [53, 8, 5, 0.1, 0], ["vegetarian", "vegan"], ["wheat", "soy"]),
  ingredient("pumpkin-seeds", "Pumpkin seeds", "pantry", "g", [560, 30, 11, 49, 6]),
];

export const ingredientById: Readonly<Record<string, Ingredient>> = Object.fromEntries(
  ingredients.map((entry) => [entry.id, entry]),
);
