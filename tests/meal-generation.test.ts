import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mealGenerationRequestSchema, type GeneratedMeal } from "@/contracts/meal-plan";
import { generateMeals, mealPrompt } from "@/server/meals/gemini";
import { POST } from "@/app/api/meals/route";

const input = mealGenerationRequestSchema.parse({
  location: { country: "CA", postalCode: "L2R 5L3" },
  budget: { amountCents: 10000, currency: "CAD" }, householdSize: 2, mealCount: 1,
  dietaryRestrictions: ["vegetarian"], excludedAllergens: [], highProtein: true,
});
const meal: GeneratedMeal = {
  id: "lentil-skillet", name: "Lemon lentil skillet", description: "A bright vegetable skillet.",
  servings: 2, prepMinutes: 25, dietaryCategory: "vegan",
  ingredients: [
    { id: "red-lentils", name: "Red lentils", quantity: 160, unit: "g", preparation: "dry", category: "protein" },
    { id: "olive-oil", name: "Olive oil", quantity: 15, unit: "ml", preparation: "as-sold", category: "pantry" },
  ],
  instructions: ["Simmer lentils in water until tender.", "Stir in olive oil and serve."],
};
function providerResponse(value: unknown = { meals: [meal] }, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] }));
}
function request(body: unknown) {
  return new Request("http://localhost/api/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "unit-test-secret"); vi.stubEnv("GOOGLE_GENAI_API_KEY", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Gemini meal generation", () => {
  it("sends structured output with the requested model and server-only key header", async () => {
    const fetcher = vi.fn().mockResolvedValue(providerResponse()); vi.stubGlobal("fetch", fetcher);
    const result = await generateMeals(input);
    expect(result.meals).toEqual([meal]); expect(result.source).toBe("gemini");
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/models\/gemini-3\.5-flash-lite:generateContent$/);
    expect(url).not.toContain("unit-test-secret");
    expect(options.headers).toMatchObject({ "x-goog-api-key": "unit-test-secret" });
    const body = JSON.parse(options.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.properties.meals).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("unit-test-secret");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses preferences and budget without sending the precise location to Gemini", () => {
    const prompt = mealPrompt(input);
    expect(prompt).toContain("100.00 CAD"); expect(prompt).toContain("exactly 2 people");
    expect(prompt).toContain("vegetarian"); expect(prompt).toContain("protein-rich");
    expect(prompt).not.toContain("L2R 5L3"); expect(prompt).toContain("never invent prices");
    expect(mealPrompt(input)).not.toEqual(prompt);
    const conventions = meal.ingredients.map(({ id, name, unit, preparation, category }) => ({ id, name, unit, preparation, category }));
    expect(mealPrompt({ ...input, ingredientConventions: conventions })).toContain(JSON.stringify(conventions));
  });
  it("returns an honest missing-key error without calling any provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(generateMeals(input)).rejects.toMatchObject({ status: 503, error: { code: "provider-not-configured" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([429, 401, 403, 404, 500])("sanitizes upstream status %s and never falls back to sample recipes", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret provider payload", { status })));
    await expect(generateMeals(input)).rejects.toMatchObject({ status: status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502 });
    try { await generateMeals(input); } catch (error) { expect(JSON.stringify(error)).not.toContain("secret provider payload"); }
  });
  it("rejects truncated output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({ meals: [meal] }, "MAX_TOKENS")));
    await expect(generateMeals(input)).rejects.toMatchObject({ status: 502 });
  });
  it.each([{}, { meals: [{ ...meal, ingredients: [] }] }, { meals: [{ ...meal, servings: 8 }] }])("rejects malformed or incompatible provider content", async value => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(value)));
    await expect(generateMeals(input)).rejects.toMatchObject({ status: 502 });
  });
  it("handles network failure and body decoding failure with sanitized errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("https://secret-key-url")));
    await expect(generateMeals(input)).rejects.toMatchObject({ status: 502, error: { code: "provider-error" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON")));
    await expect(generateMeals(input)).rejects.toMatchObject({ status: 502 });
  });
});

describe("meal route contract", () => {
  it("validates country, currency, postal code and serving limits", () => {
    expect(mealGenerationRequestSchema.safeParse({ ...input, budget: { amountCents: 10000, currency: "USD" } }).success).toBe(false);
    expect(mealGenerationRequestSchema.safeParse({ ...input, householdSize: 9 }).success).toBe(false);
    expect(mealGenerationRequestSchema.safeParse({ ...input, location: { country: "US", postalCode: "00123" }, budget: { amountCents: 10000, currency: "USD" } }).success).toBe(true);
  });
  it("returns an envelope, no-store and the shared contract header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse()));
    const response = await POST(request(input));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-ShopMate-Contract-Version")).toBe("1");
    expect(await response.json()).toMatchObject({ ok: true, data: { source: "gemini", meals: [meal] } });
  });
  it("rejects invalid JSON and input before making a provider call", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(new Request("http://localhost/api/meals", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ ...input, householdSize: 0 }))).status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
