import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GeneratedMeal } from "@/contracts/meal-plan";
import { mealImageFor } from "@/lib/meal-images";

function meal(name: string, ingredientName = "Rice"): GeneratedMeal {
  return {
    id: "test-meal", name, description: "Test recipe", servings: 2, prepMinutes: 20,
    dietaryCategory: "vegan", instructions: ["Prepare.", "Serve."],
    ingredients: [{ id: "test-ingredient", name: ingredientName, quantity: 100, unit: "g", preparation: "dry", category: "grains" }],
  };
}

describe("bundled serving inspiration", () => {
  it.each([
    ["Creamy Tomato Lentil Pasta", "pasta"],
    ["Chickpea and Spinach Curry", "curry"],
    ["Vegetable Tofu Fried Rice", "bowl"],
    ["Three-Bean Vegetarian Chili", "stew"],
    ["Roasted Vegetable Soup", "stew"],
    ["Black Bean Quesadillas", "tacos"],
    ["Black Bean Fajita Bowl", "bowl"],
    ["Black Bean Taco Bowl", "bowl"],
    ["Black Bean Tacos", "tacos"],
    ["Banana Overnight Oats", "breakfast"],
  ])("matches %s to an appropriate local food category", (name, category) => {
    expect(mealImageFor(meal(name)).src).toBe(`/meal-images/${category}.webp`);
  });

  it("uses structured ingredients when a recipe has an unfamiliar name", () => {
    expect(mealImageFor(meal("Garden comfort", "Penne pasta")).src).toBe("/meal-images/pasta.webp");
    expect(mealImageFor(meal("A fresh idea", "Corn tortillas")).src).toBe("/meal-images/tacos.webp");
    expect(mealImageFor(meal("Something simple")).src).toBe("/meal-images/bowl.webp");
  });

  it("prioritizes the actual dish over a side ingredient", () => {
    expect(mealImageFor(meal("Vegetable Soup", "Pasta")).src).toBe("/meal-images/stew.webp");
    expect(mealImageFor(meal("Roasted chickpea salad", "Tortillas")).src).toBe("/meal-images/bowl.webp");
  });

  it("ships every asset locally as a compressed real image", () => {
    for (const name of ["pasta", "curry", "bowl", "stew", "tacos", "breakfast"]) {
      const path = fileURLToPath(new URL(`../public/meal-images/${name}.webp`, import.meta.url));
      expect(existsSync(path)).toBe(true);
      const data = readFileSync(path);
      expect(data.toString("ascii", 0, 4)).toBe("RIFF");
      expect(data.toString("ascii", 8, 12)).toBe("WEBP");
      expect(data.length).toBeGreaterThan(10_000);
      expect(data.length).toBeLessThan(200_000);
    }
  });

  it("labels the image as inspiration rather than an actual recipe photograph", () => {
    const image = mealImageFor(meal("Vegan pasta"));
    expect(image.label).toBe("AI-generated serving inspiration");
    expect(image.alt).toContain("not the exact recipe");
    expect(image.alt).not.toMatch(/chicken|beef|fish|cheese/i);
    expect(image.src).toMatch(/^\/meal-images\//);
    expect(mealImageFor(meal("Vegan pasta"))).toEqual(image);
  });
});
