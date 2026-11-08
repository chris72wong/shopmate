import assert from "node:assert/strict";

// Explicit live integration check: makes four Gemini calls through the local app.
// Run only with a configured server; no credentials are read or printed here.
const origin = process.argv[2] || "http://127.0.0.1:3000";
const parsedOrigin = new URL(origin);
assert(["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname), "Use a local ShopMate server");

async function post(body, expectedStatus = 200) {
  const response = await fetch(new URL("/api/meals", origin), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  const json = await response.json();
  assert.equal(response.status, expectedStatus, json.error?.message || "Meal request failed");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return json;
}

const base = { householdSize: 2, mealCount: 3, dietaryRestrictions: [], excludedAllergens: [], highProtein: false, avoidMealNames: [] };
const canadian = { ...base, location: { country: "CA", postalCode: "L2R 5L3" }, budget: { amountCents: 10000, currency: "CAD" } };
const scenarios = [
  ["Canadian household", canadian],
  ["US household", { ...base, location: { country: "US", postalCode: "14201" }, budget: { amountCents: 10000, currency: "USD" } }],
  ["Vegetarian household", { ...canadian, dietaryRestrictions: ["vegetarian"] }],
];
let first;
for (const [label, input] of scenarios) {
  const result = await post(input);
  assert.equal(result.ok, true); assert.equal(result.data.source, "gemini");
  assert.equal(result.data.model, "gemini-3.5-flash-lite");
  assert.equal(result.data.meals.length, input.mealCount);
  assert.equal(new Set(result.data.meals.map(meal => meal.id)).size, input.mealCount);
  for (const meal of result.data.meals) {
    assert.equal(meal.servings, input.householdSize);
    assert(meal.instructions.length >= 2); assert(meal.ingredients.length >= 2);
    assert(meal.ingredients.every(item => item.quantity > 0 && ["g", "ml", "each"].includes(item.unit)));
    if (input.dietaryRestrictions.includes("vegetarian")) assert(["vegetarian", "vegan"].includes(meal.dietaryCategory));
  }
  first ??= result.data;
  console.log(`${label}: PASS — ${result.data.meals.map(meal => meal.name).join("; ")}`);
}
const avoidMealNames = first.meals.map(meal => meal.name);
const swapped = await post({ ...canadian, mealCount: 1, avoidMealNames });
assert.equal(swapped.data.meals.length, 1);
assert(!avoidMealNames.map(name => name.toLowerCase()).includes(swapped.data.meals[0].name.toLowerCase()));
console.log(`Meal swap: PASS — ${swapped.data.meals[0].name}`);
await post({ ...canadian, budget: { amountCents: 10000, currency: "USD" } }, 422);
console.log("Country/currency protection: PASS");
