import type { Diet, Nutrition, Recipe } from "@/contracts";
import { ingredientById } from "./ingredients";

type RecipeSeed = Omit<Recipe, "ingredients" | "diets" | "allergens" | "nutritionPerServing" | "nutritionBasis"> & {
  ingredients: [ingredientId: string, quantity: number][];
};
const diets: Diet[] = ["vegetarian", "vegan", "gluten-free"];

/** Derive labels and estimates from structured ingredients; this does not choose or price meals. */
function defineRecipe(seed: RecipeSeed): Recipe {
  const nutrition: Nutrition = { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  const entries = seed.ingredients.map(([id, quantity]) => {
    const item = ingredientById[id];
    if (!item) throw new Error(`Recipe ${seed.id} references unknown ingredient ${id}.`);
    for (const key of Object.keys(nutrition) as (keyof Nutrition)[]) {
      nutrition[key] += item.nutrition.values[key] * quantity / item.nutrition.basisQuantity / seed.servings;
    }
    return { ingredientId: id, quantity, unit: item.unit };
  });
  for (const key of Object.keys(nutrition) as (keyof Nutrition)[]) {
    nutrition[key] = Math.round(nutrition[key] * 10) / 10;
  }
  const sources = entries.map((entry) => ingredientById[entry.ingredientId]!);
  return { ...seed, ingredients: entries,
    diets: diets.filter((diet) => sources.every((item) => item.diets.includes(diet))),
    allergens: [...new Set(sources.flatMap((item) => item.allergens))].sort(),
    nutritionPerServing: nutrition, nutritionBasis: "estimated" };
}

/** Quantities describe the entire recipe yield. Water is the only unpriced ingredient. */
export const recipes: Recipe[] = [
  defineRecipe({ id: "banana-peanut-oats", name: "Banana & peanut butter oats",
    description: "A cozy start with creamy oats, banana, and a little crunch.",
    servings: 2, totalMinutes: 12, illustration: "grain-bowl",
    ingredients: [["oats", 100], ["banana", 200], ["peanut-butter", 30], ["pumpkin-seeds", 15]],
    steps: ["Simmer the oats in 300 ml water until tender.", "Swirl in the peanut butter.", "Divide into bowls and top with sliced banana and seeds."] }),
  defineRecipe({ id: "yogurt-breakfast-bowl", name: "The easy breakfast bowl",
    description: "Greek yogurt, toasted oats, and sweet banana. Five minutes, well spent.",
    servings: 2, totalMinutes: 5, illustration: "grain-bowl",
    ingredients: [["yogurt", 340], ["oats", 60], ["banana", 200], ["pumpkin-seeds", 20]],
    steps: ["Toast the oats in a dry pan if desired.", "Divide yogurt between two bowls.", "Top with oats, sliced banana, and seeds."] }),
  defineRecipe({ id: "chickpea-rice-bowl", name: "Lemony chickpea rice bowls",
    description: "Golden chickpeas, fresh greens, and a bright lemon finish.",
    servings: 2, totalMinutes: 30, illustration: "grain-bowl",
    ingredients: [["rice", 140], ["chickpeas", 240], ["spinach", 80], ["tomato", 200], ["olive-oil", 15], ["lemon-juice", 25]],
    steps: ["Cook the rice in water according to its package directions.", "Warm drained chickpeas in oil, then fold in spinach until wilted.", "Serve over rice with chopped tomato and lemon juice."] }),
  defineRecipe({ id: "lemon-lentil-soup", name: "One-pot lemon lentil soup",
    description: "A comforting pot of red lentils, carrots, and everyday goodness.",
    servings: 2, totalMinutes: 30, illustration: "soup",
    ingredients: [["lentils", 150], ["carrot", 180], ["onion", 100], ["garlic", 6], ["olive-oil", 15], ["lemon-juice", 25]],
    steps: ["Soften chopped onion, carrot, and garlic in oil.", "Add rinsed lentils and 700 ml water; simmer until tender, about 20 minutes.", "Stir in lemon juice and divide into bowls."] }),
  defineRecipe({ id: "black-bean-tacos", name: "Black bean & pepper tacos",
    description: "Colorful, generous tacos for a very good weeknight.",
    servings: 2, totalMinutes: 20, illustration: "skillet",
    ingredients: [["black-beans", 240], ["bell-pepper", 180], ["corn", 100], ["tortilla", 4], ["onion", 80], ["olive-oil", 10]],
    steps: ["Slice the pepper and onion and soften in oil.", "Add drained beans and corn and heat through.", "Warm the tortillas and fill with the bean mixture."] }),
  defineRecipe({ id: "tomato-spinach-pasta", name: "Tomato & spinach pasta",
    description: "A pantry favorite with silky tomato sauce and a handful of greens.",
    servings: 2, totalMinutes: 25, illustration: "skillet",
    ingredients: [["pasta", 180], ["canned-tomatoes", 400], ["spinach", 100], ["garlic", 8], ["olive-oil", 15]],
    steps: ["Cook the pasta in water according to its package directions.", "Warm garlic in oil, add tomatoes, and simmer for 10 minutes.", "Fold in spinach, then toss with drained pasta."] }),
  defineRecipe({ id: "lemon-chicken-rice", name: "Lemon chicken & brown rice",
    description: "A simple, satisfying plate with tender chicken and crisp broccoli.",
    servings: 2, totalMinutes: 35, illustration: "grain-bowl",
    ingredients: [["chicken", 300], ["rice", 140], ["broccoli", 250], ["olive-oil", 15], ["lemon-juice", 25], ["garlic", 6]],
    steps: ["Cook rice in water and steam the broccoli.", "Cut chicken into even pieces; cook in oil and garlic until the center reaches 74°C / 165°F.", "Serve with rice and broccoli and finish with lemon juice."] }),
  defineRecipe({ id: "tofu-broccoli-bowl", name: "Crispy tofu & broccoli bowls",
    description: "Golden tofu meets broccoli, brown rice, and a squeeze of lemon.",
    servings: 2, totalMinutes: 30, illustration: "grain-bowl",
    ingredients: [["tofu", 350], ["broccoli", 250], ["rice", 140], ["olive-oil", 15], ["lemon-juice", 25], ["garlic", 6]],
    steps: ["Cook rice in water according to its package directions.", "Pat tofu dry, cube it, and pan-fry in oil until golden.", "Add broccoli, garlic, and a splash of water; cover until tender and finish with lemon."] }),
  defineRecipe({ id: "egg-potato-skillet", name: "Sunday potato & egg skillet",
    description: "Crisp potatoes, soft peppers, and eggs for any day of the week.",
    servings: 2, totalMinutes: 30, illustration: "skillet",
    ingredients: [["egg", 4], ["potato", 400], ["bell-pepper", 150], ["onion", 80], ["olive-oil", 15]],
    steps: ["Dice potatoes and simmer in water until just tender; drain.", "Pan-fry potatoes, chopped pepper, and onion in oil.", "Make four wells, crack in eggs, and cover until whites and yolks are firm."] }),
  defineRecipe({ id: "peanut-tofu-pasta", name: "Peanut tofu noodle bowls",
    description: "A creamy peanut sauce brings tofu and crunchy carrots together.",
    servings: 2, totalMinutes: 25, illustration: "grain-bowl",
    ingredients: [["pasta", 160], ["tofu", 250], ["carrot", 150], ["peanut-butter", 40], ["soy-sauce", 20], ["olive-oil", 10]],
    steps: ["Cook pasta in water and reserve a little cooking water.", "Pan-fry cubed tofu and thinly sliced carrots in oil.", "Mix peanut butter, soy sauce, and cooking water; toss with tofu, carrots, and pasta."] }),
  defineRecipe({ id: "chickpea-quinoa-salad", name: "The everyday quinoa salad",
    description: "Chickpeas, cucumber, and quinoa. Fresh, bright, and happily filling.",
    servings: 2, totalMinutes: 25, illustration: "grain-bowl",
    ingredients: [["quinoa", 140], ["chickpeas", 240], ["cucumber", 180], ["tomato", 180], ["spinach", 60], ["olive-oil", 15], ["lemon-juice", 30]],
    steps: ["Rinse quinoa, cook in water according to package directions, and cool slightly.", "Chop cucumber, tomato, and spinach.", "Toss with drained chickpeas, quinoa, olive oil, and lemon juice."] }),
  defineRecipe({ id: "chicken-broccoli-pasta", name: "Chicken & broccoli pasta",
    description: "A little cheddar, plenty of broccoli, and a familiar favorite.",
    servings: 2, totalMinutes: 30, illustration: "skillet",
    ingredients: [["chicken", 280], ["pasta", 180], ["broccoli", 250], ["milk", 120], ["cheddar", 50], ["olive-oil", 10]],
    steps: ["Cook pasta in water, adding broccoli near the end; reserve some cooking water.", "Dice chicken and cook in oil until the center reaches 74°C / 165°F.", "Add milk and grated cheddar; fold in pasta and broccoli, loosening with cooking water."] }),
  defineRecipe({ id: "two-bean-chili", name: "Big-hearted two-bean chili",
    description: "A generous one-pot meal that makes the most of your pantry.",
    servings: 2, totalMinutes: 30, illustration: "soup",
    ingredients: [["black-beans", 240], ["chickpeas", 120], ["canned-tomatoes", 400], ["corn", 140], ["bell-pepper", 150], ["onion", 100], ["olive-oil", 10]],
    steps: ["Soften chopped onion and pepper in oil.", "Add drained beans, chickpeas, corn, and tomatoes.", "Simmer for 20 minutes, adding water as needed."] }),
  defineRecipe({ id: "spinach-cheddar-omelette", name: "Spinach & cheddar omelette",
    description: "Soft eggs, leafy greens, and a little cheddar. Simple feels good.",
    servings: 2, totalMinutes: 15, illustration: "skillet",
    ingredients: [["egg", 4], ["spinach", 100], ["cheddar", 60], ["tomato", 180], ["olive-oil", 10]],
    steps: ["Wilt spinach in half the oil, then set aside.", "Beat eggs and cook two omelettes in the remaining oil; add spinach and cheddar.", "Fold and cook until eggs are firm throughout, then serve with sliced tomato."] }),
];

export const recipeById: Readonly<Record<string, Recipe>> = Object.fromEntries(
  recipes.map((recipe) => [recipe.id, recipe]),
);
