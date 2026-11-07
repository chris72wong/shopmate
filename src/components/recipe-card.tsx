import type { Recipe } from "@/contracts";
import { FoodIllustration } from "./food-illustration";

export function RecipeCard({ recipe, index = 0 }: { recipe: Recipe; index?: number }) {
  const label = recipe.diets.includes("vegan") ? "Plant-based" : recipe.diets.includes("vegetarian") ? "Vegetarian" : "Everyday favorite";
  return <article className="recipe-card">
    <div className={`recipe-art recipe-art-${index % 3}`}>
      <span className="recipe-diet">{label}</span>
      <FoodIllustration variant={recipe.illustration} />
    </div>
    <div className="recipe-content">
      <div className="recipe-meta"><span>{recipe.totalMinutes} min</span><span aria-hidden="true">·</span><span>{recipe.servings} servings</span></div>
      <h3>{recipe.name}</h3>
      <p>{recipe.description}</p>
      <span className="nutrition-note">~{Math.round(recipe.nutritionPerServing.proteinG)} g protein / serving · estimate</span>
    </div>
  </article>;
}
