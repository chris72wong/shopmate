import type { Country } from "@/contracts";
import type { GeneratedMeal, MealIngredient } from "@/contracts/meal-plan";

export interface ShoppingItem {
  key: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: MealIngredient["unit"];
  preparation: MealIngredient["preparation"];
  category: MealIngredient["category"];
  mealIds: string[];
}

const categoryOrder: MealIngredient["category"][] = ["produce", "protein", "grains", "dairy", "pantry", "other"];
const categoryLabels: Record<MealIngredient["category"], string> = {
  produce: "Produce", protein: "Protein", grains: "Grains", dairy: "Dairy", pantry: "Pantry", other: "Other",
};
const singularNames: Record<string, string> = {
  onions: "onion", "yellow onions": "yellow onion", "red onions": "red onion",
  carrots: "carrot", lemons: "lemon", limes: "lime", eggs: "egg", potatoes: "potato",
  "sweet potatoes": "sweet potato", tomatoes: "tomato", "bell peppers": "bell pepper",
  bananas: "banana", apples: "apple", cucumbers: "cucumber", zucchinis: "zucchini",
  courgettes: "courgette", "garlic cloves": "garlic clove",
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const cleanName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ");
function identity(name: string): string {
  const normalized = cleanName(name).toLocaleLowerCase("en");
  // Only explicit, equivalent singular/plural spellings are merged. Qualifiers such
  // as red, frozen, cooked, certified gluten-free, or plant-based stay significant.
  return singularNames[normalized] ?? normalized;
}

/** Full recipe quantities already cover the requested household. Never scale twice.
 * Name identity is conservative: unrelated model IDs cannot silently merge foods.
 * Unit and preparation state are always part of identity; no density assumptions.
 */
export function aggregateIngredients(meals: GeneratedMeal[]): ShoppingItem[] {
  const grouped = new Map<string, { ingredients: MealIngredient[]; mealIds: Set<string> }>();
  for (const meal of meals) for (const ingredient of meal.ingredients) {
    const key = JSON.stringify([identity(ingredient.name), ingredient.unit, ingredient.preparation]);
    const group = grouped.get(key) ?? { ingredients: [], mealIds: new Set<string>() };
    group.ingredients.push(ingredient);
    group.mealIds.add(meal.id);
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([key, { ingredients, mealIds }]) => {
    // Stable summation/display do not depend on meal order. Round only the final
    // total, to six decimals, rather than rounding each recipe contribution.
    const quantities = ingredients.map(item => item.quantity).sort((a, b) => a - b);
    const quantity = Number(quantities.reduce((sum, value) => sum + value, 0).toFixed(6));
    const representative = [...ingredients].sort((a, b) => compare(cleanName(a.name), cleanName(b.name)) || compare(a.id, b.id))[0]!;
    return {
      key,
      ingredientId: ingredients.map(item => item.id).sort(compare)[0]!,
      name: cleanName(representative.name),
      quantity,
      unit: representative.unit,
      preparation: representative.preparation,
      category: [...ingredients].sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))[0]!.category,
      mealIds: [...mealIds].sort(compare),
    };
  }).sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    || compare(identity(a.name), identity(b.name)) || compare(a.key, b.key));
}

/** Search pages only: no product matching, stock, prices, or cart claims. */
export function retailerSearchLinks(country: Country, ingredientName: string): { name: string; url: string }[] {
  const query = encodeURIComponent(ingredientName.trim());
  if (country === "CA") return [{ name: "Walmart Canada", url: `https://www.walmart.ca/en/search?q=${query}` }];
  return [
    { name: "Walmart US", url: `https://www.walmart.com/search?q=${query}` },
    { name: "Kroger", url: `https://www.kroger.com/search?query=${query}` },
  ];
}

export function shoppingListText(meals: GeneratedMeal[], items: ShoppingItem[], country: Country): string {
  const number = new Intl.NumberFormat("en", { maximumFractionDigits: 6 });
  const lines = ["SHOPMATE — GROCERY LIST", country === "CA" ? "Canada · CAD" : "United States · USD", "", "Meals"];
  for (const meal of meals) lines.push(`• ${meal.name} (${meal.servings} ${meal.servings === 1 ? "serving" : "servings"})`);
  for (const category of categoryOrder) {
    const categoryItems = items.filter(item => item.category === category);
    if (!categoryItems.length) continue;
    lines.push("", categoryLabels[category]);
    for (const item of categoryItems) {
      const preparation = item.preparation === "as-sold" ? "" : `, ${item.preparation}`;
      lines.push(`[ ] ${item.name} — ${number.format(item.quantity)} ${item.unit}${preparation}`);
    }
  }
  lines.push("", "Quantities cover all selected meals and servings. Buy suitable package sizes; drained/edible quantities may differ from label weight.",
    "AI-generated recipes. Check product labels and dietary suitability. Prices, stock, checkout carts, and delivery are not verified.");
  return `${lines.join("\n")}\n`;
}
