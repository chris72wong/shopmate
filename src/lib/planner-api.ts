import { z } from "zod";
import type { ApiErrorCode, OptimizationRequest, OptimizationResult, StoreDiscoveryResult, StoreV2, CoreOptimizationResult, PriceBasis, OptimizationResultV2, PricingResultV2 } from "@/contracts";
import { countrySchema, currencySchema, moneySchema } from "@/contracts";

const quantity = z.object({ quantity: z.number().nonnegative(), unit: z.enum(["g", "ml", "each"]) });
const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const pricing = z.discriminatedUnion("status", [
  z.object({ status: z.literal("illustrative"), profileId: z.enum(["ca-loblaws", "ca-no-frills", "ca-walmart", "us-aldi", "us-kroger", "us-walmart", "demo-ca-cedar", "demo-ca-clover", "demo-ca-orchard", "demo-us-cedar", "demo-us-clover", "demo-us-orchard"]) }),
  z.object({ status: z.literal("unavailable"), profileId: z.null() }),
]);
const baseStore = z.object({ id: z.string(), name: z.string(), address: z.string(), country: countrySchema,
  chainId: z.enum(["ca-loblaws", "ca-no-frills", "ca-walmart", "us-aldi", "us-kroger", "us-walmart"]).nullable(), pricing });
const discoverySchema = z.object({
  mode: z.enum(["live", "demo"]), location: z.object({ country: countrySchema, postalCode: z.string(), currency: currencySchema }),
  origin: z.object({ label: z.string(), coordinates: coordinates.nullable() }), radiusKm: z.number(),
  stores: z.array(z.discriminatedUnion("source", [
    baseStore.extend({ source: z.literal("demo"), googlePlaceId: z.null(), coordinates: z.null(), distanceMeters: z.null(), googleMapsUri: z.null() }),
    baseStore.extend({ source: z.literal("google"), googlePlaceId: z.string(), coordinates, distanceMeters: z.number().nonnegative(), googleMapsUri: z.string() }),
  ])), attributions: z.array(z.object({ provider: z.literal("google-maps"), displayName: z.string(), uri: z.string() })), notices: z.array(z.string()),
});
export const discoveryViewSchema: z.ZodType<StoreDiscoveryResult> = discoverySchema;
export type StoreDiscoveryResultV2 = Omit<StoreDiscoveryResult, "stores"> & { stores: StoreV2[] };
const pricingV2 = z.discriminatedUnion("status", [
  pricing.options[0],
  z.object({ status: z.literal("verified-capable"), providerId: z.enum(["reef-loblaws", "reef-kroger"]), channel: z.enum(["in-store", "pickup", "delivery"]) }),
  pricing.options[1].extend({ reason: z.string() }),
]);
export const discoveryV2ViewSchema: z.ZodType<StoreDiscoveryResultV2> = discoverySchema.extend({ stores: z.array(z.discriminatedUnion("source", [
  discoverySchema.shape.stores.element.options[0].extend({ pricing: pricingV2 }),
  discoverySchema.shape.stores.element.options[1].extend({ pricing: pricingV2 }),
])) });
const optimizationBase = z.object({ mode: z.enum(["live", "demo"]), country: countrySchema, currency: currencySchema,
  pricingBasis: z.literal("illustrative"), search: z.object({ evaluatedCombinations: z.number().int().nonnegative(), exhaustive: z.boolean() }), notices: z.array(z.string()) });
const line = z.object({ ingredientId: z.string(), productId: z.string(), required: quantity, packageCount: z.number().int().positive(),
  purchased: quantity, leftover: quantity, unitPrice: moneySchema, subtotal: moneySchema });
const optimizationSchema = z.discriminatedUnion("status", [
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
export const optimizationViewSchema: z.ZodType<OptimizationResult> = optimizationSchema;

const providerId = z.enum(["reef-loblaws", "reef-kroger"]);
const channel = z.enum(["in-store", "pickup", "delivery"]);
const product = z.object({ id: z.string(), ingredientId: z.string(), name: z.string(), label: z.string(), content: quantity, countries: z.array(countrySchema) });
const promotion = z.object({ type: z.enum(["unconditional-sale", "loyalty", "multi-buy", "coupon", "unknown"]), price: moneySchema,
  validFrom: z.string().nullable(), validTo: z.string().nullable(), minimumQuantity: z.number().nullable(), membershipRequired: z.boolean(), couponRequired: z.boolean(), conditions: z.string().nullable() });
const observation = z.object({ providerId, retailer: z.string(), country: countrySchema, providerStoreId: z.string(), productId: z.string(), gtin: z.string().nullable(),
  name: z.string(), brand: z.string().nullable(), category: z.string().nullable(), packageLabel: z.string().nullable(), packageQuantity: quantity.nullable(),
  regularPrice: moneySchema.nullable(), regularPriceIsCurrent: z.boolean(), promotionalPrice: moneySchema.nullable(), promotions: z.array(promotion),
  unitPrice: z.object({ price: moneySchema, per: quantity }).nullable(), availability: z.enum(["available", "unavailable", "unknown"]), channel,
  scope: z.enum(["branch", "region"]), priceIsEstimate: z.boolean(), retrievedAt: z.string(), sourceObservedAt: z.string().nullable(),
  providerUpdatedAt: z.string().nullable(), expiresAt: z.string(), sourceUrl: z.string().nullable() });
const verifiedOffer = z.object({ product, price: moneySchema, basis: z.literal("verified"), available: z.literal(true), observation,
  provenance: z.object({ providerId, providerStoreId: z.string(), providerProductId: z.string(), channel, priceType: z.enum(["regular", "unconditional-sale"]),
    retrievedAt: z.string(), providerUpdatedAt: z.string().nullable(), expiresAt: z.string(), sourceUrl: z.string().nullable() }) });
export const pricingViewSchema: z.ZodType<PricingResultV2> = z.object({ mode: z.enum(["live", "demo"]), country: countrySchema, currency: currencySchema,
  catalogVersion: z.string(), notices: z.array(z.string()), stores: z.array(z.union([
    z.object({ status: z.literal("available"), storeId: z.string(), basis: z.literal("illustrative"), missingIngredientIds: z.array(z.string()),
      offers: z.array(z.object({ productId: z.string(), profileId: pricing.options[0].shape.profileId, price: moneySchema, basis: z.literal("illustrative"), available: z.boolean() })) }),
    z.object({ status: z.literal("available"), storeId: z.string(), basis: z.literal("verified"), missingIngredientIds: z.array(z.string()), offers: z.array(verifiedOffer) }),
    z.object({ status: z.literal("unavailable"), storeId: z.string(), reason: z.enum(["unsupported-store", "provider-not-configured", "provider-error", "rate-limited", "no-usable-offers"]), message: z.string() }),
  ])) });
const v2Metadata = { pricingBasis: z.enum(["illustrative", "verified"]), catalogVersion: z.string(), optimizerVersion: z.string(), pricing: pricingViewSchema,
  search: z.object({ evaluatedCombinations: z.number().int().nonnegative(), exhaustive: z.boolean(), evaluationLimit: z.number().int().positive(), candidateRecipeIds: z.array(z.string()) }) };
export const optimizationV2ViewSchema: z.ZodType<OptimizationResultV2> = z.discriminatedUnion("status", [
  optimizationSchema.options[0].extend({ ...v2Metadata, baskets: z.array(z.discriminatedUnion("status", [
    optimizationSchema.options[0].shape.baskets.element.options[0].extend({ basis: v2Metadata.pricingBasis }),
    optimizationSchema.options[0].shape.baskets.element.options[1],
  ])) }),
  optimizationSchema.options[1].extend(v2Metadata), optimizationSchema.options[2].extend(v2Metadata),
]);

type PricingSelection = Pick<OptimizationRequest, "mode" | "country" | "storeIds"> & { catalogVersion: string };
export function pricingMatchesRequest(result: PricingResultV2, request: PricingSelection): boolean {
  const currency = request.country === "CA" ? "CAD" : "USD";
  const basis = request.mode === "demo" ? "illustrative" : "verified";
  return result.mode === request.mode && result.country === request.country && result.currency === currency && result.catalogVersion === request.catalogVersion
    && result.stores.length === request.storeIds.length && new Set(result.stores.map(store => store.storeId)).size === result.stores.length
    && result.stores.every(store => request.storeIds.includes(store.storeId) && (store.status === "unavailable" || (store.basis === basis && store.offers.every(offer => offer.price.currency === currency))));
}
export function planV2MatchesRequest(result: OptimizationResultV2, request: OptimizationRequest & { catalogVersion: string }): boolean {
  return result.pricingBasis === (request.mode === "demo" ? "illustrative" : "verified") && result.catalogVersion === request.catalogVersion
    && pricingMatchesRequest(result.pricing, request) && planMatchesRequest(result, request)
    && (result.status !== "feasible" || result.baskets.every(basket => basket.status !== "complete" || basket.basis === result.pricingBasis));
}

const errorSchema = z.object({ code: z.enum(["invalid-json", "invalid-request", "not-implemented", "provider-not-configured", "provider-error", "not-found", "rate-limited", "internal-error"]),
  message: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() });

export class PlannerApiError extends Error {
  constructor(public code: ApiErrorCode | "network" | "invalid-response", message: string, public details: { path: string; message: string }[] = []) { super(message); }
}

/** Refuse mismatched responses before presenting currencies or store comparisons together. */
export function planMatchesRequest(result: CoreOptimizationResult<PriceBasis>, request: OptimizationRequest): boolean {
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

export async function postPlanner<T>(path: "/api/stores" | "/api/optimize" | "/api/v2/stores" | "/api/v2/pricing" | "/api/v2/optimize", body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(path.startsWith("/api/v2/") ? 65_000 : 20_000)]) }); }
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
