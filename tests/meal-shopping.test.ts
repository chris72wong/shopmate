import { describe, expect, it } from "vitest";
import type { GeneratedMeal, MealIngredient } from "@/contracts/meal-plan";
import { aggregateIngredients, retailerSearchLinks, shoppingListText } from "@/lib/meal-shopping";

function ingredient(patch: Partial<MealIngredient> = {}): MealIngredient {
  return { id: "onion", name: "Onion", quantity: 100, unit: "g", preparation: "edible", category: "produce", ...patch };
}
function meal(id: string, ingredients: MealIngredient[]): GeneratedMeal {
  return { id, name: `Meal ${id}`, description: "Test fixture", servings: 2, ingredients,
    instructions: ["Prepare ingredients.", "Cook and serve."], prepMinutes: 20, dietaryCategory: "vegan" };
}

describe("AI meal shopping aggregation", () => {
  it("combines shared ingredients across meals without scaling household quantities again", () => {
    const meals = [meal("a", [ingredient({ quantity: 120 })]), meal("b", [ingredient({ quantity: 180 })])];
    expect(aggregateIngredients(meals)).toEqual([expect.objectContaining({ quantity: 300, unit: "g", mealIds: ["a", "b"] })]);
  });
  it("merges case, whitespace, known plurals and identical names with different generated IDs", () => {
    const result = aggregateIngredients([meal("a", [ingredient(), ingredient({ id: "onions", name: "  ONIONS  ", quantity: 50 })])]);
    expect(result).toHaveLength(1); expect(result[0]?.quantity).toBe(150);
  });
  it("keeps food qualifiers significant even if Gemini accidentally reuses an ID", () => {
    expect(aggregateIngredients([meal("a", [ingredient(), ingredient({ name: "Red onion" })])])).toHaveLength(2);
    expect(aggregateIngredients([meal("a", [ingredient({ name: "Milk" }), ingredient({ name: "Soy milk" })])])).toHaveLength(2);
  });
  it("never merges grams, milliliters or counts", () => {
    const result = aggregateIngredients([meal("a", [ingredient(), ingredient({ unit: "ml" }), ingredient({ unit: "each" })])]);
    expect(result).toHaveLength(3); expect(result.every(item => item.quantity === 100)).toBe(true);
  });
  it("preserves dry, drained, edible and as-sold requirements", () => {
    const result = aggregateIngredients([meal("a", (["dry", "drained", "edible", "as-sold"] as const).map(preparation => ingredient({ preparation })))]);
    expect(result).toHaveLength(4); expect(new Set(result.map(item => item.key)).size).toBe(4);
  });
  it("sums decimals before rounding and does not mutate inputs", () => {
    const meals = [meal("a", [ingredient({ quantity: 0.1 }), ingredient({ quantity: 0.2 })])];
    const original = structuredClone(meals);
    expect(aggregateIngredients(meals)[0]?.quantity).toBe(0.3); expect(meals).toEqual(original);
  });
  it("returns stable ordering, keys and totals after meal order changes", () => {
    const meals = [meal("b", [ingredient({ name: "Olive oil", id: "olive-oil", unit: "ml", category: "pantry" })]), meal("a", [ingredient()])];
    expect(aggregateIngredients(meals)).toEqual(aggregateIngredients([...meals].reverse()));
    const swapped = [meal("new", [ingredient()]), meals[0]!];
    expect(aggregateIngredients(swapped)[0]?.key).toBe(aggregateIngredients(meals)[0]?.key);
  });
  it("removes ingredients belonging only to a replaced meal and updates shared totals", () => {
    const first = meal("a", [ingredient({ quantity: 50 }), ingredient({ id: "carrot", name: "Carrot" })]);
    const second = meal("b", [ingredient({ quantity: 100 })]);
    expect(aggregateIngredients([first, second])[1]?.quantity).toBe(150);
    const result = aggregateIngredients([meal("c", [ingredient({ quantity: 75 })]), second]);
    expect(result).toHaveLength(1); expect(result[0]?.quantity).toBe(175); expect(result[0]?.mealIds).toEqual(["b", "c"]);
  });
  it("includes pantry ingredients and empty plans have an empty list", () => {
    expect(aggregateIngredients([meal("a", [ingredient({ name: "Olive oil", category: "pantry" })])])[0]?.name).toBe("Olive oil");
    expect(aggregateIngredients([])).toEqual([]);
  });
});

describe("honest retailer handoff", () => {
  it("uses independently verified regional search routes and encodes user/model text", () => {
    const query = "Rice & beans / café?";
    const canada = retailerSearchLinks("CA", query);
    expect(canada).toHaveLength(1); expect(new URL(canada[0]!.url).hostname).toBe("www.walmart.ca");
    expect(new URL(canada[0]!.url).pathname).toBe("/en/search");
    expect(new URL(canada[0]!.url).searchParams.get("q")).toBe(query);
    const us = retailerSearchLinks("US", query);
    expect(us.map(link => new URL(link.url).hostname)).toEqual(["www.walmart.com", "www.kroger.com"]);
    expect(new URL(us[1]!.url).searchParams.get("query")).toBe(query);
    expect([...canada, ...us].every(link => !link.url.includes("cart"))).toBe(true);
  });
  it("exports complete quantities, preparation basis, meals and honest limits in portable plain text", () => {
    const meals = [meal("a", [ingredient({ id: "chickpeas", name: "Chickpeas", quantity: 240, preparation: "drained", category: "protein" }), ingredient({ name: "Olive oil", unit: "ml", category: "pantry" })])];
    const text = shoppingListText(meals, aggregateIngredients(meals), "CA");
    expect(text).toContain("Canada · CAD"); expect(text).toContain("Meal a (2 servings)");
    expect(text).toContain("[ ] Chickpeas — 240 g, drained"); expect(text).toContain("Olive oil — 100 ml");
    expect(text).toContain("Prices, stock, checkout carts, and delivery are not verified.");
    expect(text.endsWith("\n")).toBe(true);
    expect(shoppingListText([], [], "US")).toContain("United States · USD");
  });
});
