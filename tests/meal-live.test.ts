import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mealGenerationRequestSchema } from "@/contracts/meal-plan";
import { generateMeals } from "@/server/meals/gemini";

// Opt in explicitly; this test sends one real, billable provider request.
// SHOPMATE_RUN_GEMINI_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/meal-live.test.ts
const enabled = process.env.SHOPMATE_RUN_GEMINI_LIVE === "1";
beforeAll(() => {
  if (!enabled) return;
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    const response = await nativeFetch(url, options);
    if (!response.ok) {
      const body = await response.clone().json() as { error?: { status?: string; message?: string; details?: unknown } };
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || "";
      const message = String(body.error?.message ?? "Provider rejected request").replaceAll(key, "[REDACTED]");
      console.error("Gemini live check:", response.status, body.error?.status, message);
      if (body.error?.details) console.error("Validation details:", JSON.stringify(body.error.details).replaceAll(key, "[REDACTED]"));
    }
    return response;
  });
});
afterAll(() => vi.unstubAllGlobals());
it.skipIf(!enabled)("generates real structured meals with the configured Gemini model", async () => {
  const result = await generateMeals(mealGenerationRequestSchema.parse({
    location: { country: "CA", postalCode: "L2R 5L3" }, budget: { amountCents: 10000, currency: "CAD" },
    householdSize: 2, mealCount: 1, dietaryRestrictions: ["vegetarian"], excludedAllergens: [], highProtein: false,
  }));
  expect(result.source).toBe("gemini"); expect(result.model).toBe("gemini-3.5-flash-lite");
  expect(result.meals).toHaveLength(1); expect(result.meals[0]?.servings).toBe(2);
}, 65_000);
