import { z } from "zod";
import type { ApiErrorCode, OptimizationRequest, OptimizationResult, StoreDiscoveryResult } from "@/contracts";
import { countrySchema, currencySchema, moneySchema } from "@/contracts";

const quantity = z.object({ quantity: z.number().nonnegative(), unit: z.enum(["g", "ml", "each"]) });
const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const pricing = z.discriminatedUnion("status", [
  z.object({ status: z.literal("illustrative"), profileId: z.enum(["ca-loblaws", "ca-no-frills", "ca-walmart", "us-aldi", "us-kroger", "us-walmart", "demo-ca-cedar", "demo-ca-clover", "demo-ca-orchard", "demo-us-cedar", "demo-us-clover", "demo-us-orchard"]) }),
  z.object({ status: z.literal("unavailable"), profileId: z.null() }),
]);
const baseStore = z.object({ id: z.string(), name: z.string(), address: z.string(), country: countrySchema,
  chainId: z.enum(["ca-loblaws", "ca-no-frills", "ca-walmart", "us-aldi", "us-kroger", "us-walmart"]).nullable(), pricing });
export const discoveryViewSchema: z.ZodType<StoreDiscoveryResult> = z.object({
  mode: z.enum(["live", "demo"]), location: z.object({ country: countrySchema, postalCode: z.string(), currency: currencySchema }),
  origin: z.object({ label: z.string(), coordinates: coordinates.nullable() }), radiusKm: z.number(),
  stores: z.array(z.discriminatedUnion("source", [
    baseStore.extend({ source: z.literal("demo"), googlePlaceId: z.null(), coordinates: z.null(), distanceMeters: z.null(), googleMapsUri: z.null() }),
    baseStore.extend({ source: z.literal("google"), googlePlaceId: z.string(), coordinates, distanceMeters: z.number().nonnegative(), googleMapsUri: z.string() }),
  ])), attributions: z.array(z.object({ provider: z.literal("google-maps"), displayName: z.string(), uri: z.string() })), notices: z.array(z.string()),
});
const optimizationBase = z.object({ mode: z.enum(["live", "demo"]), country: countrySchema, currency: currencySchema,
  pricingBasis: z.literal("illustrative"), search: z.object({ evaluatedCombinations: z.number().int().nonnegative(), exhaustive: z.boolean() }), notices: z.array(z.string()) });
const line = z.object({ ingredientId: z.string(), productId: z.string(), required: quantity, packageCount: z.number().int().positive(),
  purchased: quantity, leftover: quantity, unitPrice: moneySchema, subtotal: moneySchema });
export const optimizationViewSchema: z.ZodType<OptimizationResult> = z.discriminatedUnion("status", [
  optimizationBase.extend({ status: z.literal("feasible"), optimality: z.enum(["proven", "best-found"]),
    meals: z.array(z.object({ slot: z.number().int().nonnegative(), recipeId: z.string(), servings: z.number().positive() })),
    requirements: z.array(quantity.extend({ ingredientId: z.string(), usedByRecipeIds: z.array(z.string()) })),
    estimatedTotalNutrition: z.object({ caloriesKcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number(), fiberG: z.number() }),
    baskets: z.array(z.discriminatedUnion("status", [
      z.object({ status: z.literal("complete"), storeId: z.string(), lines: z.array(line), total: moneySchema, basis: z.literal("illustrative") }),
      z.object({ status: z.literal("unavailable"), storeId: z.string(), missingIngredientIds: z.array(z.string()), reason: z.string() }),
    ])), recommendedStoreId: z.string(), total: moneySchema, budgetRemaining: moneySchema,
    ingredientReuse: z.array(z.object({ ingredientId: z.string(), recipeIds: z.array(z.string()), packagesAvoided: z.number().int().nonnegative(), estimatedSavings: moneySchema })),
    basketSavings: z.object({ comparedToStoreId: z.string(), amount: moneySchema }).nullable(), explanations: z.array(z.string()),
  }),
  optimizationBase.extend({ status: z.literal("infeasible"), reason: z.enum(["budget", "dietary-constraints", "pricing-unavailable"]), message: z.string(), minimumKnownCost: moneySchema.nullable() }),
  optimizationBase.extend({ status: z.literal("incomplete"), reason: z.literal("search-limit"), message: z.string() }),
]);
const errorSchema = z.object({ code: z.enum(["invalid-json", "invalid-request", "not-implemented", "provider-not-configured", "provider-error", "not-found", "rate-limited", "internal-error"]),
  message: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() });

export class PlannerApiError extends Error {
  constructor(public code: ApiErrorCode | "network" | "invalid-response", message: string, public details: { path: string; message: string }[] = []) { super(message); }
}

/** Refuse mismatched responses before presenting currencies or store comparisons together. */
export function planMatchesRequest(result: OptimizationResult, request: OptimizationRequest): boolean {
  const currency = request.preferences.weeklyBudget.currency;
  if (result.mode !== request.mode || result.country !== request.country || result.currency !== currency) return false;
  if (result.status === "incomplete") return !result.search.exhaustive;
  if (result.status === "infeasible") return result.search.exhaustive && (!result.minimumKnownCost || result.minimumKnownCost.currency === currency);
  if (result.optimality === "proven" && !result.search.exhaustive) return false;
  if (result.meals.length !== request.preferences.mealCount || result.meals.some((meal, index) => meal.slot !== index || meal.servings !== request.preferences.servingsPerMeal)) return false;
  if (result.baskets.length !== request.storeIds.length || new Set(result.baskets.map(basket => basket.storeId)).size !== result.baskets.length || result.baskets.some(basket => !request.storeIds.includes(basket.storeId))) return false;
  const recommended = result.baskets.find(basket => basket.storeId === result.recommendedStoreId);
  if (recommended?.status !== "complete" || recommended.total.amountCents !== result.total.amountCents) return false;
  if (result.total.amountCents > request.preferences.weeklyBudget.amountCents || result.budgetRemaining.amountCents !== request.preferences.weeklyBudget.amountCents - result.total.amountCents) return false;
  const money = [result.total, result.budgetRemaining, ...result.ingredientReuse.map(item => item.estimatedSavings),
    ...(result.basketSavings ? [result.basketSavings.amount] : []),
    ...result.baskets.flatMap(basket => basket.status === "complete" ? [basket.total, ...basket.lines.flatMap(line => [line.unitPrice, line.subtotal])] : [])];
  return money.every(value => value.currency === currency);
}

export async function postPlanner<T>(path: "/api/stores" | "/api/optimize", body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new PlannerApiError("network", "We couldn’t connect. Check your connection and try again.");
  }
  let json: unknown;
  try { json = await response.json(); } catch { throw new PlannerApiError("invalid-response", "We couldn’t read that response. Please try again."); }
  const envelope = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: schema }), z.object({ ok: z.literal(false), error: errorSchema })]).safeParse(json);
  if (!envelope.success) throw new PlannerApiError("invalid-response", "Something was missing from the response. Please try again.");
  if (!envelope.data.ok) throw new PlannerApiError(envelope.data.error.code, envelope.data.error.message, envelope.data.error.details);
  if (!response.ok) throw new PlannerApiError("invalid-response", "The request didn’t complete. Please try again.");
  return envelope.data.data;
}
