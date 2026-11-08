import "server-only";
import { z } from "zod";
import type { ResolvedStore } from "@/server/discovery/provider";
import { canonicalName, normalizeGtin } from "@/server/pricing/normalize";
import { ServiceError } from "@/server/errors";
import { matchGroceryBanner } from "@/server/discovery/chains";

const quantity = z.strictObject({ quantity: z.number().positive().max(1_000_000), unit: z.enum(["g", "ml", "each"]) });
const providerId = z.enum(["reef-loblaws", "reef-kroger", "kroger"]);
const banner = z.enum(["loblaw", "nofrills", "superstore", "zehrs", "fortinos"]);
const bannerRetailers = { loblaw: "Loblaws", nofrills: "No Frills", superstore: "Real Canadian Superstore", zehrs: "Zehrs", fortinos: "Fortinos" };
export const branchBindingSchema = z.strictObject({ googlePlaceId: z.string().regex(/^[A-Za-z0-9_-]{1,240}$/), providerId,
  retailer: z.string().min(1).max(80), country: z.enum(["CA", "US"]), providerStoreId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  channel: z.enum(["in-store", "pickup", "delivery"]), banner: banner.optional(),
  address: z.strictObject({ line1: z.string().min(3).max(200), city: z.string().min(1).max(100), region: z.string().regex(/^[A-Z]{2}$/), postalCode: z.string().min(5).max(10) }),
}).superRefine((value, context) => {
  if ((value.providerId === "reef-loblaws" && (value.country !== "CA" || !value.banner || value.channel !== "pickup"))
    || (value.providerId !== "reef-loblaws" && (value.country !== "US" || value.channel !== "in-store"))) {
    context.addIssue({ code: "custom", message: "Use documented provider country/channel coverage; Reef Loblaws is pickup, Kroger is in-store." });
  }
  if (value.providerId === "reef-loblaws" && value.banner && canonicalName(value.retailer) !== canonicalName(bannerRetailers[value.banner])) context.addIssue({ code: "custom", path: ["retailer"], message: "Retailer and Canadian provider banner must agree." });
  if (value.providerId === "kroger" && !/^\d{8}$/.test(value.providerStoreId)) context.addIssue({ code: "custom", path: ["providerStoreId"], message: "Use the actual eight-digit official Kroger location ID." });
});
export const productMappingSchema = z.strictObject({ providerId, retailer: z.string().min(1).max(80), ingredientId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  productId: z.string().min(1).max(160).optional(), gtin: z.string().regex(/^\d{8,14}$/).optional(),
  expectedName: z.string().min(1).max(500), expectedBrand: z.string().min(1).max(200),
  netQuantity: quantity, usableQuantity: quantity, preparation: z.enum(["dry", "drained", "edible", "raw", "as-sold"]),
  contentEvidenceUrl: z.url().startsWith("https://"),
}).superRefine((value, context) => {
  if (value.gtin && !normalizeGtin(value.gtin)) context.addIssue({ code: "custom", path: ["gtin"], message: "Use a GTIN with a valid GS1 check digit." });
  if (value.netQuantity.unit === value.usableQuantity.unit && value.usableQuantity.quantity > value.netQuantity.quantity) context.addIssue({ code: "custom", message: "Usable content cannot exceed net content." });
  if (value.providerId === "kroger" && value.productId && !/^\d{1,20}$/.test(value.productId)) context.addIssue({ code: "custom", path: ["productId"], message: "Use an actual numeric official Kroger product ID." });
});
export type BranchBinding = z.infer<typeof branchBindingSchema>;
export type ProductMapping = z.infer<typeof productMappingSchema>;
export interface RetailConfig { bindings: BranchBinding[]; mappings: ProductMapping[] }
export function loadRetailConfig(): RetailConfig {
  try {
    const bindings = z.array(branchBindingSchema).max(100).parse(JSON.parse(process.env.SHOPMATE_PRICING_STORES ?? "[]"));
    const mappings = z.array(productMappingSchema).max(200).parse(JSON.parse(process.env.SHOPMATE_PRICING_PRODUCTS ?? "[]"));
    if (new Set(bindings.map(item => item.googlePlaceId)).size !== bindings.length) throw Error("Duplicate branch mapping.");
    return { bindings, mappings };
  } catch { throw new ServiceError(503, { code: "provider-not-configured", message: "Retail pricing configuration needs valid, reviewed branch and product mappings." }); }
}
export function addressMatches(actual: { line1: string; postalCode: string; country: string }, binding: BranchBinding): boolean {
  return actual.country.toUpperCase() === binding.country && canonicalName(actual.line1) === canonicalName(binding.address.line1)
    && actual.postalCode.replace(/\s/g, "").toUpperCase() === binding.address.postalCode.replace(/\s/g, "").toUpperCase();
}
export function bindingForStore(store: ResolvedStore, config: RetailConfig): BranchBinding | undefined {
  if (store.source !== "google") return undefined;
  const binding = config.bindings.find(item => `google:${item.googlePlaceId}` === store.id && item.country === store.country);
  if (!binding) return undefined;
  const actualBanner = matchGroceryBanner(store.name, store.country);
  const configuredBanner = matchGroceryBanner(binding.retailer, binding.country);
  if (!actualBanner || actualBanner.id !== configuredBanner?.id) return undefined;
  const parts = store.address.split(",").map(canonicalName);
  const postal = store.address.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return parts[0] === canonicalName(binding.address.line1) && parts.includes(canonicalName(binding.address.city))
    && postal.includes(binding.address.postalCode.replace(/\s/g, "").toUpperCase()) ? binding : undefined;
}
