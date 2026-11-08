import { z } from "zod";
import type { OptimizationRequest, StoreDiscoveryRequest } from "./api";
import type { Country, Currency } from "./domain";

export const countrySchema = z.enum(["CA", "US"]);
export const currencySchema = z.enum(["CAD", "USD"]);
export const dietSchema = z.enum(["vegetarian", "vegan", "gluten-free"]);
export const allergenSchema = z.enum([
  "milk", "egg", "fish", "shellfish", "tree-nuts", "peanuts", "wheat", "soy", "sesame",
]);
export const currencyForCountry = (country: Country): Currency => country === "CA" ? "CAD" : "USD";

const canadianPostalCode = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ]\d[ABCEGHJ-NPRSTVWXYZ]\d$/;
const usZipCode = /^\d{5}(-\d{4})?$/;

export const locationInputSchema = z.strictObject({
  country: countrySchema,
  postalCode: z.string().trim().min(1).max(16),
}).superRefine((input, context) => {
  const valid = input.country === "CA"
    ? canadianPostalCode.test(input.postalCode.replace(/ /g, "").toUpperCase())
    : usZipCode.test(input.postalCode);
  if (!valid) context.addIssue({
    code: "custom", path: ["postalCode"],
    message: input.country === "CA" ? "Enter a valid Canadian postal code, such as M5V 2T6."
      : "Enter a five-digit ZIP code or ZIP+4, such as 14201 or 14201-1234.",
  });
}).transform((input) => {
  const compact = input.postalCode.replace(/ /g, "").toUpperCase();
  return {
    country: input.country,
    postalCode: input.country === "CA" ? `${compact.slice(0, 3)} ${compact.slice(3)}` : input.postalCode,
  };
});

const unique = <T>(items: T[]) => new Set(items).size === items.length;
const ingredientIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
export const moneySchema = z.strictObject({
  amountCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema,
});
export const preferencesSchema = z.strictObject({
  weeklyBudget: moneySchema.extend({ amountCents: z.number().int().min(1).max(1_000_000) }),
  mealCount: z.number().int().min(1).max(14),
  servingsPerMeal: z.number().int().min(1).max(8),
  dietaryRestrictions: z.array(dietSchema).max(3).refine(unique, "Remove duplicate dietary restrictions."),
  excludedIngredientIds: z.array(ingredientIdSchema).max(50).refine(unique, "Remove duplicate ingredients."),
  excludedAllergens: z.array(allergenSchema).max(9).refine(unique, "Remove duplicate allergens."),
  nutritionPriorities: z.array(z.literal("high-protein")).max(1),
  objective: z.enum(["minimize-cost", "maximize-nutrition", "balanced"]),
});

/** Missing mode is deliberately invalid: live requests never silently become demo requests. */
export const storeDiscoveryRequestSchema: z.ZodType<StoreDiscoveryRequest> = z.strictObject({
  mode: z.enum(["demo", "live"]),
  location: locationInputSchema,
  radiusKm: z.number().min(1).max(50).default(5),
  discoveryScope: z.enum(["major-chains", "all-grocers"]).optional(),
});
export const optimizationRequestSchema: z.ZodType<OptimizationRequest> = z.strictObject({
  mode: z.enum(["demo", "live"]),
  country: countrySchema,
  storeIds: z.array(z.string().min(1).max(256)).min(1).max(3)
    .refine(unique, "Select different stores."),
  preferences: preferencesSchema,
}).superRefine((input, context) => {
  if (input.preferences.weeklyBudget.currency !== currencyForCountry(input.country)) {
    context.addIssue({ code: "custom", path: ["preferences", "weeklyBudget", "currency"],
      message: "The budget currency must match the selected country." });
  }
  for (const [index, id] of input.storeIds.entries()) {
    const prefix = input.mode === "demo" ? `demo-${input.country.toLowerCase()}-` : "google:";
    if (!id.startsWith(prefix) || id.length === prefix.length) {
      context.addIssue({ code: "custom", path: ["storeIds", index],
        message: "Use store IDs from discovery in the same country and mode." });
    }
  }
});
