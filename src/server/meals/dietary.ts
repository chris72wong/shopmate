import "server-only";
import type { Allergen } from "@/contracts";
import type { GeneratedMeal, MealGenerationRequest } from "@/contracts/meal-plan";
import { ServiceError } from "@/server/errors";

const normalized = (text: string): string => text.toLowerCase().normalize("NFKC").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const meat = /\b(chicken|beef|pork|bacon|ham|turkey|duck|lamb|veal|venison|sausage|pepperoni|prosciutto|chorizo|fish|salmon|tuna|cod|haddock|tilapia|trout|anchov(?:y|ies)|sardines?|shrimp|prawns?|crab|lobster|clams?|mussels?|oysters?|scallops?|gelatin|gelatine|lard|tallow)\b/;
const dairy = /\b(milk|buttermilk|butter|cream|cheese|yogurt|yoghurt|ghee|whey|casein|curds?|paneer|parmesan|pecorino|mozzarella|cheddar|feta|ricotta)\b/;
const gluten = /\b(wheat|barley|rye|spelt|farro|bulgur|couscous|semolina|seitan|freekeh|malt|pasta|noodles?|bread|breadcrumbs?|flour|tortillas?|soy sauce)\b/;
const allergenPatterns: Record<Allergen, RegExp> = {
  milk: dairy,
  egg: /\b(eggs?|mayonnaise|mayo|meringue|albumen)\b/,
  fish: /\b(fish|salmon|tuna|cod|haddock|tilapia|trout|anchov(?:y|ies)|sardines?|bonito|dashi|worcestershire)\b/,
  shellfish: /\b(shrimp|prawns?|crab|lobster|clams?|mussels?|oysters?|scallops?|shellfish)\b/,
  "tree-nuts": /\b(almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?)\b/,
  peanuts: /\b(peanuts?|groundnuts?)\b/,
  wheat: /\b(wheat|spelt|farro|bulgur|couscous|semolina|seitan|freekeh)\b/,
  soy: /\b(soy|soya|tofu|tempeh|edamame|miso|tamari)\b/,
  sesame: /\b(sesame|tahini)\b/,
};

function withoutPlantSubstitutes(text: string): string {
  return text
    .replace(/\b(?:king )?oyster mushrooms?\b/g, "mushroom")
    .replace(/\b(?:butter beans?|butter lettuce|cream of tartar)\b/g, "plant ingredient")
    .replace(/\b(?:peanut|almond|cashew|sunflower|cocoa|coconut|apple|seed|nut) butter\b/g, "plant spread")
    .replace(/\b(?:almond|oat|soy|soya|coconut|rice|cashew|pea|hemp) (?:milk|cream|yogurt|yoghurt)\b/g, "plant alternative")
    .replace(/\b(?:vegan|plant based|non dairy|dairy free|egg free) (?:milk|cream|butter|cheese|yogurt|yoghurt|parmesan|mozzarella|cheddar|feta|ricotta|mayonnaise|mayo|eggs?)\b/g, "plant alternative")
    .replace(/\b(?:vegan|plant based|meat free|vegetarian|mock) (?:chicken|beef|pork|bacon|ham|turkey|sausage|fish|shrimp)\b/g, "plant alternative")
    .replace(/\b(?:chicken|beef|pork|meat|fish|egg|dairy|milk) free\b/g, "plant alternative");
}

function withoutGlutenFreeSubstitutes(text: string): string {
  return text
    .replace(/\bgluten free (?:soy sauce|pasta|noodles?|bread|breadcrumbs?|flour|tortillas?|oats?)\b/g, "gluten free alternative")
    .replace(/\b(?:rice|corn|maize|chickpea|lentil|buckwheat|quinoa) (?:pasta|noodles?|flour|tortillas?)\b/g, "gluten free alternative")
    .replace(/\b(?:almond|coconut|tapioca|potato|arrowroot|sorghum) flour\b/g, "gluten free alternative");
}

function reject(reason: string): never {
  throw new ServiceError(502, {
    code: "provider-error",
    message: `The generated plan ${reason}. Please regenerate your meals.`,
  });
}

function checkFoodText(text: string, request: MealGenerationRequest, vegetarian: boolean, vegan: boolean): void {
  const original = normalized(text);
  const plantAware = withoutPlantSubstitutes(original);
  if (vegetarian && meat.test(plantAware)) reject("included an ingredient incompatible with your vegetarian preferences");
  if (vegan && (dairy.test(plantAware) || /\b(eggs?|honey|mayonnaise|mayo|meringue|albumen)\b/.test(plantAware))) {
    reject("included an ingredient incompatible with your vegan preferences");
  }
  const glutenAware = withoutGlutenFreeSubstitutes(original);
  if (request.dietaryRestrictions.includes("gluten-free") && gluten.test(glutenAware)) reject("included a likely gluten source");
  for (const allergen of request.excludedAllergens) {
    // Plant-based does not mean free of soy, nuts, wheat or sesame.
    const haystack = allergen === "milk" || allergen === "egg" || allergen === "shellfish" ? plantAware : original;
    if (allergenPatterns[allergen].test(haystack)) reject("included an ingredient matching an excluded allergen");
    if (allergen === "wheat" && /\b(pasta|noodles?|bread|breadcrumbs?|flour|tortillas?|soy sauce)\b/.test(glutenAware)) {
      reject("included a likely wheat source");
    }
  }
}

/** Defense against common ingredient conflicts, not a product-label or cross-contact guarantee. */
export function validateMealPreferences(meals: GeneratedMeal[], request: MealGenerationRequest): void {
  if (meals.length !== request.mealCount) reject("did not contain the requested number of meals");
  const ids = new Set<string>();
  const names = new Set<string>();
  const avoided = new Set(request.avoidMealNames.map(normalized));
  for (const meal of meals) {
    if (meal.servings !== request.householdSize) reject("did not match your household size");
    const name = normalized(meal.name);
    if (ids.has(meal.id) || names.has(name)) reject("repeated a meal");
    if (avoided.has(name)) reject("repeated a meal you asked to replace");
    ids.add(meal.id);
    names.add(name);
    const vegan = request.dietaryRestrictions.includes("vegan") || meal.dietaryCategory === "vegan";
    const vegetarian = vegan || request.dietaryRestrictions.includes("vegetarian") || meal.dietaryCategory === "vegetarian";
    if (request.dietaryRestrictions.includes("vegan") && meal.dietaryCategory !== "vegan") reject("did not match your vegan preferences");
    if (request.dietaryRestrictions.includes("vegetarian") && meal.dietaryCategory === "omnivore") reject("did not match your vegetarian preferences");
    for (const ingredient of meal.ingredients) checkFoodText(`${ingredient.name} ${ingredient.id}`, request, vegetarian, vegan);

    // Instructions may refer to compliant ingredients with shorthand ("milk", "pasta").
    // Remove only those generic references when that meal explicitly declares the substitute.
    let instructions = normalized(meal.instructions.join(" "));
    if ((vegan || request.excludedAllergens.includes("milk")) && /\b(?:cow(?:'s)?|goat(?:'s)?|sheep(?:'s)?|whole|skimmed?|dairy|regular) milk\b/.test(instructions)) {
      reject("included an instruction incompatible with your milk-free preferences");
    }
    const declared = meal.ingredients.map(ingredient => normalized(ingredient.name)).join(" ");
    const safePlant = /\b(?:almond|oat|soy|soya|coconut|rice|cashew|pea|hemp|vegan|plant based|non dairy|dairy free|egg free) (milk|cream|butter|cheese|yogurt|yoghurt|parmesan|mozzarella|cheddar|feta|ricotta|mayonnaise|mayo|eggs?)\b/g;
    for (const match of declared.matchAll(safePlant)) instructions = instructions.replace(new RegExp(`\\b${match[1]}\\b`, "g"), "plant alternative");
    const safeGluten = /\b(?:gluten free|rice|corn|maize|chickpea|lentil|buckwheat|quinoa) (soy sauce|pasta|noodles?|bread|breadcrumbs?|flour|tortillas?)\b/g;
    for (const match of declared.matchAll(safeGluten)) instructions = instructions.replace(new RegExp(`\\b${match[1]}\\b`, "g"), "gluten free alternative");
    checkFoodText(instructions, request, vegetarian, vegan);
  }
}
