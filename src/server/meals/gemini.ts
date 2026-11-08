import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  generatedMealSchema, type MealGenerationRequest, type MealPlanResult,
} from "@/contracts/meal-plan";
import { ServiceError } from "@/server/errors";
import { validateMealPreferences } from "@/server/meals/dietary";

export const GEMINI_MODEL = "gemini-3.5-flash-lite" as const;
const providerOutputSchema = z.strictObject({ meals: z.array(generatedMealSchema).min(1).max(7) });
const providerEnvelopeSchema = z.object({
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional(),
  })).optional(),
});

// Gemini accepts a subset of JSON Schema. Send structural constraints only;
// the complete Zod schema still enforces every bound and ID rule on receipt.
function providerJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerJsonSchema);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => ["type", "properties", "required", "items", "enum", "description"].includes(key))
    .map(([key, child]) => [key, key === "properties" && child !== null && typeof child === "object"
      ? Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, providerJsonSchema(schema)]))
      : providerJsonSchema(child)]));
}

export function mealPrompt(input: MealGenerationRequest): string {
  // The postal code stays within ShopMate; meal generation only needs the country.
  return `You are ShopMate, a practical home cook creating a varied grocery-ready meal plan.
Return exactly ${input.mealCount} DIFFERENT main meals, each serving exactly ${input.householdSize} people.
Country: ${input.location.country === "CA" ? "Canada" : "United States"}.
Grocery budget intention: ${(input.budget.amountCents / 100).toFixed(2)} ${input.budget.currency} for ALL these meals.
Use economical ingredients and ingredient reuse when the budget is tight. Budget is guidance only: never invent prices, savings, product listings, inventory, stores, or claim a guaranteed total.
HARD dietary constraints: ${input.dietaryRestrictions.join(", ") || "none"}.
HARD excluded allergens: ${input.excludedAllergens.join(", ") || "none"}.
${input.highProtein ? "Prioritize protein-rich meals using compatible ingredients. This is a soft preference." : "Favor balanced, satisfying main meals."}
Never include incompatible foods even in broth, sauces, seasonings, garnishes, or instructions. Use explicitly named gluten-free ingredients when gluten-free is selected. For vegan avoid dairy, eggs, honey, meat and fish. For vegetarian avoid meat, fish, meat broth, gelatin and fish sauce.
Do not repeat or lightly rename these previous meals: ${JSON.stringify(input.avoidMealNames)}.
Choose a fresh mix of cuisines, vegetables, protein sources and cooking techniques; avoid repeating the same base in every meal. Variation seed: ${randomUUID()}.
Ingredient quantities cover the FULL declared servings, not a single serving. Include every required ingredient including oil, salt, spices and sauces; water may be omitted.
Only use g, ml or each. Never assume ml equals g. Use g for dry grains, drained beans, meat and ALL edible produce including onions and garlic; ml for liquids/oil; each only for eggs/tortillas/bread slices. preparation is dry for uncooked grains/pasta/legumes, drained for canned legumes, edible for produce/meat, and as-sold for liquids, dairy, salt, spices, eggs and tortillas.
Give the SAME ingredient the SAME simple lowercase kebab-case ID, name, unit, preparation and category across meals. Do not include cutting/cooking instructions in ingredient names or IDs. Keep genuinely distinct ingredients distinct (e.g. red-lentils vs green-lentils; raw rice vs cooked rice). Reuse common groceries across meals where sensible.
When replacing a meal, reuse these existing ingredient names, IDs, units and preparation states wherever they describe the same food: ${JSON.stringify(input.ingredientConventions)}. These conventions are metadata only; choose your own appropriate recipe quantities for the household.
Provide specific quantities, concise doable cooking instructions, realistic total preparation minutes, unique recipe IDs and accurate dietaryCategory (omnivore, vegetarian or vegan). No nutrition claims or photographs. Output only the requested JSON.`;
}

function unavailable(message: string): never {
  throw new ServiceError(502, { code: "provider-error", message });
}

export async function generateMeals(input: MealGenerationRequest, signal?: AbortSignal): Promise<MealPlanResult> {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENAI_API_KEY?.trim();
  if (!key) throw new ServiceError(503, {
    code: "provider-not-configured",
    message: "Meal generation is unavailable. Configure GEMINI_API_KEY on the server and try again.",
  });
  const deadline = AbortSignal.timeout(55_000);
  const combinedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST", cache: "no-store", signal: combinedSignal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: mealPrompt(input) }] }],
        generationConfig: {
          temperature: 1, maxOutputTokens: 16_384,
          responseMimeType: "application/json",
          responseJsonSchema: providerJsonSchema(z.toJSONSchema(providerOutputSchema)),
        },
      }),
    });
  } catch {
    unavailable(combinedSignal.aborted
      ? "Meal generation took too long or was cancelled. Please try again."
      : "We couldn’t reach Gemini. Please try again shortly.");
  }
  if (response.status === 429) throw new ServiceError(429, {
    code: "rate-limited", message: "Gemini’s request limit has been reached. Please wait a minute and try again.",
  });
  if (response.status === 401 || response.status === 403) throw new ServiceError(503, {
    code: "provider-not-configured", message: "Gemini access was denied. Check the server’s API key and model permissions.",
  });
  if (response.status === 404) unavailable("The configured Gemini account cannot access gemini-3.5-flash-lite. Check model access and try again.");
  if (!response.ok) unavailable("Gemini couldn’t generate meals right now. Please try again.");
  let meals: MealPlanResult["meals"];
  try {
    const body: unknown = await response.json();
    const envelope = providerEnvelopeSchema.parse(body);
    const candidate = envelope.candidates?.[0];
    if (candidate?.finishReason !== "STOP") unavailable("Gemini didn’t finish a complete meal plan. Please try again.");
    const json = candidate.content?.parts.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
    const parsed: unknown = JSON.parse(json);
    meals = providerOutputSchema.parse(parsed).meals;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    unavailable("Gemini returned an incomplete or invalid meal plan. Please try again.");
  }
  validateMealPreferences(meals, input);
  return {
    source: "gemini", model: GEMINI_MODEL, meals,
    notices: [
      "AI-generated recipes. Review ingredients, cooking instructions and product labels before use.",
      "Budget guides meal ideas. Grocery prices, stock and checkout totals are unavailable.",
      "Shopping links search retailer websites; they do not create a cart or reserve products.",
    ],
  };
}
