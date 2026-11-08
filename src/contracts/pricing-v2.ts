import { z } from "zod";
import { countrySchema, currencyForCountry, locationInputSchema, optimizationRequestSchema, preferencesSchema } from "./schemas";
import type { BasketComparison, BasketLine, Country, Currency, DataMode, FeasibleOptimization, IncompleteOptimization, InfeasibleOptimization, Money, ProductOffer, ProductPackage, Quantity, Store } from "./domain";
import type { ApiError, StoreDiscoveryResult } from "./api";

export type PriceBasis = "illustrative" | "verified";
export type PriceChannel = "in-store" | "pickup" | "delivery";
export type RetailPricingProvider = "reef-loblaws" | "reef-kroger" | "kroger";
export interface Promotion {
  type: "unconditional-sale" | "loyalty" | "multi-buy" | "coupon" | "unknown";
  price: Money; validFrom: string | null; validTo: string | null;
  minimumQuantity: number | null; membershipRequired: boolean; couponRequired: boolean; conditions: string | null;
}
/** Observations preserve source scope; regional/unknown-stock prices cannot become verified offers. */
export interface RetailProductObservation {
  providerId: RetailPricingProvider; retailer: string; country: Country; providerStoreId: string;
  productId: string; gtin: string | null; name: string; brand: string | null; category: string | null;
  packageLabel: string | null; packageQuantity: Quantity | null;
  regularPrice: Money | null; regularPriceIsCurrent: boolean; promotionalPrice: Money | null; promotions: Promotion[];
  unitPrice: { price: Money; per: Quantity } | null;
  availability: "available" | "unavailable" | "unknown";
  channel: PriceChannel; scope: "branch" | "region";
  priceIsEstimate: boolean; retrievedAt: string; sourceObservedAt: string | null; providerUpdatedAt: string | null; expiresAt: string; sourceUrl: string | null;
}
export interface VerifiedOffer {
  product: ProductPackage; price: Money; basis: "verified"; available: true;
  observation: RetailProductObservation;
  provenance: { providerId: RetailPricingProvider; providerStoreId: string; providerProductId: string; channel: PriceChannel;
    priceType: "regular" | "unconditional-sale"; retrievedAt: string; providerUpdatedAt: string | null; expiresAt: string; sourceUrl: string | null };
}
export type StorePricingV2 =
  | { status: "illustrative"; profileId: Extract<Store["pricing"], { status: "illustrative" }>["profileId"] }
  | { status: "verified-capable"; providerId: RetailPricingProvider; channel: PriceChannel }
  | { status: "unavailable"; profileId: null; reason: string };
export type StoreV2 = Store extends infer S ? S extends Store ? Omit<S, "pricing"> & { pricing: StorePricingV2 } : never : never;
export interface StoreDiscoveryResultV2 extends Omit<StoreDiscoveryResult, "stores"> {
  stores: StoreV2[];
  selectedStoreIds: string[];
  selection: { strategy: "nearest-distinct-banners" | "demo-order"; limit: 3; distanceBasis: "straight-line" | null; exhaustive: false; candidateLimit: 20 | null };
}
export type PricingSetV2 =
  | { status: "available"; storeId: string; basis: "illustrative"; offers: ProductOffer[]; missingIngredientIds: string[] }
  | { status: "available"; storeId: string; basis: "verified"; offers: VerifiedOffer[]; missingIngredientIds: string[] }
  | { status: "unavailable"; storeId: string; reason: "unsupported-store" | "provider-not-configured" | "provider-error" | "rate-limited" | "no-usable-offers"; message: string };
export interface PricingResultV2 { mode: DataMode; country: Country; currency: Currency; catalogVersion: string; stores: PricingSetV2[]; notices: string[] }
export type RepricedBasket<B extends PriceBasis> = Extract<BasketComparison, { status: "unavailable" }>
  | (Omit<Extract<BasketComparison, { status: "complete" }>, "basis"> & { basis: B });
export type CoreOptimizationResult<B extends PriceBasis> =
  | (Omit<FeasibleOptimization, "pricingBasis" | "baskets"> & { pricingBasis: B; baskets: RepricedBasket<B>[] })
  | (Omit<InfeasibleOptimization, "pricingBasis"> & { pricingBasis: B })
  | (Omit<IncompleteOptimization, "pricingBasis"> & { pricingBasis: B });
export interface MixedStorePlan extends Pick<FeasibleOptimization, "meals" | "requirements" | "estimatedTotalNutrition" | "budgetRemaining"> {
  basis: PriceBasis;
  optimality: "proven" | "best-found";
  lines: (BasketLine & { storeId: string })[];
  stores: { storeId: string; total: Money }[];
  total: Money;
  /** Only the cheapest complete single-store basket for these identical meals. */
  savings: { comparedToStoreId: string; amount: Money } | null;
}
type ResultMetadata = { catalogVersion: string; optimizerVersion: string; pricing: PricingResultV2;
  mixedStorePlan?: MixedStorePlan | null;
  search: { evaluatedCombinations: number; exhaustive: boolean; evaluationLimit: number; candidateRecipeIds: string[] } };
export type OptimizationResultV2 = (CoreOptimizationResult<PriceBasis> extends infer R ? R extends { search: unknown } ? Omit<R, "search"> & ResultMetadata : never : never);

const storeIds = z.array(z.string().min(1).max(256)).min(1).max(3).refine(ids => new Set(ids).size === ids.length, "Select different stores.");
export const pricingRequestV2Schema = z.strictObject({ mode: z.enum(["demo", "live"]), country: countrySchema, storeIds, catalogVersion: z.string().min(1).max(64) }).superRefine((input, context) => {
  const prefix = input.mode === "demo" ? `demo-${input.country.toLowerCase()}-` : "google:";
  if (input.storeIds.some(id => !id.startsWith(prefix) || id.length === prefix.length)) context.addIssue({ code: "custom", path: ["storeIds"], message: "Use discovered IDs from the same country and mode." });
});
export const optimizationRequestV2Schema = z.strictObject({ ...pricingRequestV2Schema.shape, preferences: preferencesSchema }).superRefine((input, context) => {
  const { catalogVersion: _version, ...v1 } = input;
  void _version;
  const parsed = optimizationRequestSchema.safeParse(v1);
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  if (input.preferences.weeklyBudget.currency !== currencyForCountry(input.country)) context.addIssue({ code: "custom", path: ["preferences", "weeklyBudget", "currency"], message: "Country and currency must agree." });
});

/** One call can discover, select and plan; storeIds is an optional explicit override. */
export const planningRequestV2Schema = z.strictObject({ mode: z.enum(["demo", "live"]), location: locationInputSchema, radiusKm: z.number().min(1).max(50).default(5),
  catalogVersion: z.string().min(1).max(64), preferences: preferencesSchema, storeIds: storeIds.optional(),
}).superRefine((input, context) => {
  if (!input.storeIds) {
    if (input.preferences.weeklyBudget.currency !== currencyForCountry(input.location.country)) context.addIssue({ code: "custom", path: ["preferences", "weeklyBudget", "currency"], message: "Country and currency must agree." });
    return;
  }
  const parsed = optimizationRequestV2Schema.safeParse({ mode: input.mode, country: input.location.country,
    catalogVersion: input.catalogVersion, preferences: input.preferences,
    storeIds: input.storeIds,
  });
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export interface PlanningResultV2 {
  status: "planned" | "pricing-unavailable" | "no-plan" | "no-stores";
  discovery: StoreDiscoveryResultV2;
  selectedStoreIds: string[];
  optimization: OptimizationResultV2 | null;
  pricingError: ApiError | null;
}
