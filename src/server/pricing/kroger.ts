import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RetailProductObservation } from "@/contracts";
import type { ResolvedStore } from "@/server/discovery/provider";
import { matchGroceryBanner } from "@/server/discovery/chains";
import { canonicalName, decimalMoney, normalizeGtin, parsePackage, safeProductUrl } from "@/server/pricing/normalize";
import { addressMatches, type BranchBinding } from "@/server/pricing/retail-config";
import { RetailHttp, retailFailure, retailUnavailable } from "@/server/pricing/retail-http";

const locationSchema = z.object({ locationId: z.string().regex(/^\d{8}$/), chain: z.string().min(1),
  address: z.object({ addressLine1: z.string().min(1), city: z.string().min(1), state: z.string().regex(/^[A-Z]{2}$/), zipCode: z.string().regex(/^\d{5}(?:-\d{4})?$/) }) });
const itemSchema = z.object({ itemId: z.string().min(1), size: z.string().nullish(), soldBy: z.string().optional(),
  price: z.object({ regular: z.number().optional(), promo: z.number().optional() }).nullish(),
  inventory: z.object({ stockLevel: z.string().optional() }).nullish(),
  fulfillment: z.object({ inStore: z.boolean().optional() }).optional(),
});
const productSchema = z.object({ productId: z.string().regex(/^\d{1,20}$/), upc: z.string().optional(), description: z.string().min(1),
  brand: z.string().nullish(), categories: z.array(z.string()).optional(), productPageURI: z.string().optional(), items: z.array(z.unknown()).max(50).optional() });
const krogerBanners = new Set(["kroger", "ralphs", "fred-meyer", "frys", "king-soopers", "city-market", "smiths", "dillons", "bakers", "gerbes", "qfc", "pick-n-save", "metro-market", "marianos", "food-4-less", "foods-co", "jay-c", "pay-less", "harris-teeter"].map(id => `us-${id}`));
const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string().regex(/^bearer$/i), expires_in: z.number().int().positive() });
const tokens = new Map<string, { value: string; expiresAt: number }>();
const pendingTokens = new Map<string, Promise<string>>();
const sharedHttp = new RetailHttp();
interface KrogerOptions { clientId?: string; clientSecret?: string; http?: RetailHttp; now?: () => number }

/** Official Public Products/Locations API. No consumer session, scraping or customer OAuth is used. */
export class KrogerPricingAdapter {
  private readonly http: RetailHttp;
  private readonly now: () => number;
  constructor(private readonly options: KrogerOptions = {}) { this.http = options.http ?? sharedHttp; this.now = options.now ?? Date.now; }
  private credentials() {
    const id = (this.options.clientId ?? process.env.KROGER_CLIENT_ID)?.trim();
    const secret = (this.options.clientSecret ?? process.env.KROGER_CLIENT_SECRET)?.trim();
    if (!id || !secret) throw retailUnavailable();
    return { id, secret, key: createHash("sha256").update(`${id}:${secret}`).digest("hex") };
  }
  configured(): boolean { try { this.credentials(); return true; } catch { return false; } }
  private async token(): Promise<string> {
    const credentials = this.credentials();
    const cached = tokens.get(credentials.key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const pending = pendingTokens.get(credentials.key);
    if (pending) return pending;
    const operation = (async () => {
      const raw = await this.http.json(`kroger:oauth:${credentials.key}`, "https://api.kroger.com/v1/connect/oauth2/token", {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${credentials.id}:${credentials.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" }).toString(),
      });
      const parsed = tokenSchema.safeParse(raw);
      if (!parsed.success) throw retailUnavailable();
      if (tokens.size >= 20) tokens.delete(tokens.keys().next().value!);
      tokens.set(credentials.key, { value: parsed.data.access_token, expiresAt: this.now() + Math.max(0, parsed.data.expires_in - 30) * 1000 });
      return parsed.data.access_token;
    })();
    pendingTokens.set(credentials.key, operation);
    try { return await operation; } finally { pendingTokens.delete(credentials.key); }
  }
  private async call(path: string, params: Record<string, string> = {}) {
    const url = new URL(`https://api.kroger.com/v1/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const credentials = this.credentials();
    const key = `kroger:${credentials.key}:${url.pathname}:${url.search}`;
    try {
      // No persistent product/location cache: each pricing run retrieves the current branch-scoped data.
      const data = await this.http.json(key, url.href, { headers: { Authorization: `Bearer ${await this.token()}`, Accept: "application/json" } });
      const retrievedAt = this.http.observedAt(key);
      return { data, retrievedAt, expiresAt: new Date(Date.parse(retrievedAt) + 300_000).toISOString() };
    } catch (error) { tokens.delete(credentials.key); throw error; }
  }
  private sameLocation(location: z.infer<typeof locationSchema>, binding: BranchBinding): boolean {
    return location.locationId === binding.providerStoreId && canonicalName(location.chain) === canonicalName(binding.retailer)
      && addressMatches({ line1: location.address.addressLine1, postalCode: location.address.zipCode.slice(0, 5), country: "US" }, { ...binding, address: { ...binding.address, postalCode: binding.address.postalCode.slice(0, 5) } })
      && canonicalName(location.address.city) === canonicalName(binding.address.city) && location.address.state === binding.address.region;
  }
  async verifyBranch(binding: BranchBinding): Promise<void> {
    if (binding.providerId !== "kroger" || binding.country !== "US" || binding.channel !== "in-store") throw retailFailure();
    const response = await this.call(`locations/${encodeURIComponent(binding.providerStoreId)}`);
    const parsed = z.object({ data: locationSchema }).safeParse(response.data);
    if (!parsed.success || !this.sameLocation(parsed.data.data, binding)) throw retailFailure();
  }
  async resolveBranch(store: ResolvedStore): Promise<BranchBinding | undefined> {
    const banner = matchGroceryBanner(store.name, store.country);
    if (store.source !== "google" || store.country !== "US" || !banner || !krogerBanners.has(banner.id)) return undefined;
    if (!this.configured()) throw retailUnavailable();
    // Exact street/city/state/ZIP agreement only. Ambiguous or differently formatted addresses need a reviewed binding.
    const parts = store.address.split(",").map(part => part.trim());
    const region = /^([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/.exec(parts[2] ?? "");
    if (!parts[0] || !parts[1] || !region) return undefined;
    const response = await this.call("locations", { "filter.zipCode.near": region[2]!, "filter.radiusInMiles": "10", "filter.limit": "20" });
    const parsed = z.object({ data: z.array(locationSchema).max(20) }).safeParse(response.data);
    if (!parsed.success) throw retailFailure();
    const matches = parsed.data.data.flatMap(location => {
      if (matchGroceryBanner(location.chain, "US")?.id !== banner.id) return [];
      const binding: BranchBinding = { googlePlaceId: store.id.slice("google:".length), providerId: "kroger", retailer: location.chain, country: "US",
        providerStoreId: location.locationId, channel: "in-store", address: { line1: parts[0]!, city: parts[1]!, region: region[1]!, postalCode: region[2]! } };
      return this.sameLocation(location, binding) ? [binding] : [];
    });
    return matches.length === 1 ? matches[0] : undefined;
  }
  private observations(raw: unknown[], binding: BranchBinding, timestamps: { retrievedAt: string; expiresAt: string }): RetailProductObservation[] {
    return raw.flatMap(value => {
      const parsed = productSchema.safeParse(value);
      if (!parsed.success) return [];
      const product = parsed.data;
      return (product.items ?? []).flatMap(value => {
        const parsedItem = itemSchema.safeParse(value);
        if (!parsedItem.success) return [];
        const item = parsedItem.data;
        const quantity = parsePackage(item.size ?? null, "US");
        const regular = decimalMoney(item.price?.regular, "USD");
        const sale = decimalMoney(item.price?.promo, "USD");
        const sourceUrl = product.productPageURI?.startsWith("/p/") ? safeProductUrl(`https://www.kroger.com${product.productPageURI}`) : null;
        return [{ providerId: "kroger", retailer: binding.retailer, country: "US", providerStoreId: binding.providerStoreId,
          productId: product.productId, gtin: normalizeGtin(product.upc), name: product.description, brand: product.brand ?? null,
          category: product.categories?.join(" / ") ?? null, packageLabel: item.size ?? null, packageQuantity: quantity,
          regularPrice: regular, regularPriceIsCurrent: Boolean(regular), promotionalPrice: sale,
          promotions: sale ? [{ type: "loyalty", price: sale, validFrom: null, validTo: null, minimumQuantity: null, membershipRequired: true, couponRequired: false, conditions: "Kroger-card eligibility and sale dates are not verified; only regular prices enter baskets." }] : [],
          unitPrice: regular && quantity ? { price: regular, per: quantity } : null,
          availability: item.inventory?.stockLevel === "TEMPORARILY_OUT_OF_STOCK" || item.fulfillment?.inStore === false ? "unavailable"
            : ["HIGH", "LOW"].includes(item.inventory?.stockLevel ?? "") && item.fulfillment?.inStore === true ? "available" : "unknown",
          channel: "in-store", scope: "branch", priceIsEstimate: item.soldBy?.toUpperCase() !== "UNIT",
          retrievedAt: timestamps.retrievedAt, expiresAt: timestamps.expiresAt,
          sourceObservedAt: null, providerUpdatedAt: null, sourceUrl } satisfies RetailProductObservation];
      });
    });
  }
  async search(binding: BranchBinding, query: string): Promise<RetailProductObservation[]> {
    if (binding.providerId !== "kroger" || binding.country !== "US" || binding.channel !== "in-store" || query.trim().length < 2 || query.length > 120) throw retailFailure();
    const response = await this.call("products", { "filter.locationId": binding.providerStoreId, "filter.fulfillment": "ais", "filter.term": query.trim(), "filter.limit": "20" });
    const parsed = z.object({ data: z.array(z.unknown()).max(20) }).safeParse(response.data);
    if (!parsed.success) throw retailFailure();
    return this.observations(parsed.data.data, binding, response);
  }
  async lookup(binding: BranchBinding, productId: string): Promise<RetailProductObservation[]> {
    if (binding.providerId !== "kroger" || binding.country !== "US" || binding.channel !== "in-store" || !/^\d{1,20}$/.test(productId)) throw retailFailure();
    const response = await this.call(`products/${productId}`, { "filter.locationId": binding.providerStoreId });
    if (response.data === null) return [];
    const parsed = z.object({ data: z.unknown() }).safeParse(response.data);
    if (!parsed.success) throw retailFailure();
    return this.observations([parsed.data.data], binding, response);
  }
}
