import type { GeneratedMeal } from "@/contracts/meal-plan";

type MealImageCategory = "pasta" | "curry" | "bowl" | "stew" | "tacos" | "breakfast";
export interface MealImage { src: string; alt: string; label: string }

const descriptions: Record<MealImageCategory, string> = {
  pasta: "Tomato and basil pasta",
  curry: "Chickpea and spinach curry with rice",
  bowl: "Vegetable, tofu and rice bowl",
  stew: "Three-bean vegetable chili",
  tacos: "Black bean and sweet potato tacos",
  breakfast: "Oatmeal with berries and banana",
};

/** Bundled category images, never a claim to photograph this exact generated recipe.
 * All six source images depict plant-based food; they are not allergen guarantees.
 * Choosing an image makes no external API call and consumes no Gemini quota.
 */
export function mealImageFor(meal: GeneratedMeal): MealImage {
  const name = meal.name.toLowerCase().replace(/[-_]/g, " ");
  const ingredients = meal.ingredients.map(ingredient => `${ingredient.id} ${ingredient.name}`).join(" ").toLowerCase().replace(/[-_]/g, " ");
  let category: MealImageCategory = "bowl";
  if (/\b(oatmeal|porridge|oats|breakfast|muesli|overnight oats)\b/.test(name)) category = "breakfast";
  else if (/\b(?:fajita|taco)s?\b/.test(name) && /\bbowl\b/.test(name)) category = "bowl";
  else if (/\b(tacos?|quesadillas?|burritos?|fajitas?|wraps?|tostadas?)\b/.test(name)) category = "tacos";
  else if (/\b(curry|curries|dal|dahl|tikka|korma|masala)\b/.test(name)) category = "curry";
  else if (/\b(soup|stew|chili|chilli|minestrone|chowder)\b/.test(name)) category = "stew";
  else if (/\b(pasta|penne|spaghetti|noodles?|fettuccine|macaroni|lasagn[ae])\b/.test(name)) category = "pasta";
  else if (/\b(stir fry|fried rice|bowl|salad|risotto|skillet)\b/.test(name)) category = "bowl";
  else if (/\b(pasta|penne|spaghetti|fettuccine|macaroni)\b/.test(ingredients)) category = "pasta";
  else if (/\b(tortillas?)\b/.test(ingredients)) category = "tacos";
  else if (/\b(oats|oatmeal)\b/.test(ingredients)) category = "breakfast";
  return {
    src: `/meal-images/${category}.webp`,
    alt: `${descriptions[category]} — AI-generated serving inspiration, not the exact recipe`,
    label: "AI-generated serving inspiration",
  };
}
