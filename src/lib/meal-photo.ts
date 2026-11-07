import type { Recipe } from "@/contracts";

/** Licensed photography for serving inspiration; never a claim of exact recipe contents. */
export function mealPhoto(recipe: Recipe): string {
  if (recipe.id.includes("oats") || recipe.id.includes("breakfast")) return "/photos/oats.jpg";
  if (recipe.id.includes("pasta")) return "/photos/pasta.jpg";
  return recipe.illustration === "soup" ? "/photos/soup.jpg" : "/photos/salad.jpg";
}
