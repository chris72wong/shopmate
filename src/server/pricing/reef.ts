import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PriceChannel, RetailProductObservation, Promotion } from "@/contracts";
import { canonicalName, decimalMoney, normalizeGtin, parsePackage, safeProductUrl } from "@/server/pricing/normalize";
import { addressMatches, type BranchBinding } from "@/server/pricing/retail-config";
import { RetailHttp, retailFailure, retailUnavailable } from "@/server/pricing/retail-http";

const envelope = z.object({ ok: z.literal(true), meta: z.object({ mode: z.literal("live"), fetched_at: z.iso.datetime().optional(), cache_hit: z.boolean().optional(), modality: z.string().optional() }).passthrough(), data: z.unknown() });
const canadaRow = z.object({ product_id: z.string(), title: z.string(), brand: z.string().nullable(), package_size: z.string().nullable(), price: z.union([z.number(), z.string()]).nullable(),
  currency: z.literal("CAD"), original_price: z.union([z.number(), z.string()]).nullish(), price_is_estimate: z.boolean(), sold_by: z.string(), stock_status: z.string(),
  gtin: z.string().nullish(), url: z.string().nullish(), category: z.string().nullish(),
  deal: z.object({ type: z.string(), text: z.string().nullish(), expires: z.string().nullish() }).nullish(),
  member_price: z.union([z.number(), z.string()]).nullish(), multi_buy: z.unknown().optional(),
});
const usRow = z.object({ upc: z.string(), gtin14: z.string().nullish(), title: z.string(), brand: z.string().nullable(), size: z.string().nullable(),
  regular_price: z.union([z.number(), z.string()]).nullable(), sale_price: z.union([z.number(), z.string()]).nullish(), sale_ends_at: z.string().nullish(),
  currency: z.literal("USD"), price_is_estimate: z.boolean(), sold_by: z.string(), stock_level: z.string().nullish(), available_to_sell: z.number().nullish(),
  url: z.string().nullish(), category: z.string().nullish(), multibuy: z.unknown().optional(), ways_to_shop: z.object({ in_store: z.boolean().optional() }).optional(),
});
interface ReefOptions { apiKey?: string; http?: RetailHttp }
const sharedHttp = new RetailHttp();
export class ReefPricingAdapter {
  private readonly http: RetailHttp;
  constructor(private readonly options: ReefOptions = {}) { this.http = options.http ?? sharedHttp; }
  configured(): boolean { return Boolean((this.options.apiKey ?? process.env.REEF_KEY)?.trim()); }
  private async call(binding: BranchBinding, action: "search" | "stores", params: Record<string, string | number>) {
    const apiKey = (this.options.apiKey ?? process.env.REEF_KEY)?.trim();
    if (!apiKey) throw retailUnavailable();
    const engine = binding.providerId === "reef-loblaws" ? "loblaws" : "kroger";
    const key = `${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}:${engine}:${action}:${binding.providerStoreId}:${binding.channel}:${JSON.stringify(params)}`;
    const raw = await this.http.json(key, `https://api.reefapi.com/${engine}/v1/${action}`, { method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", "User-Agent": "ShopMate/0.1" }, body: JSON.stringify(params) }, 300_000);
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) throw retailFailure();
    if (parsed.data.meta.cache_hit && !parsed.data.meta.fetched_at) throw retailFailure();
    if (binding.providerId === "reef-kroger" && parsed.data.meta.modality && parsed.data.meta.modality !== "IN_STORE") throw retailFailure();
    const retrievedAt = this.http.observedAt(key);
    const expiresAt = new Date(Date.parse(retrievedAt) + 300_000).toISOString();
    // A provider-side cache must not make an old observation look fresh.
    const sourceObservedAt = parsed.data.meta.fetched_at ?? null;
    return { data: parsed.data.data, retrievedAt, sourceObservedAt, providerUpdatedAt: null,
      expiresAt: sourceObservedAt ? new Date(Math.min(Date.parse(expiresAt), Date.parse(sourceObservedAt) + 300_000)).toISOString() : expiresAt };
  }
  async verifyBranch(binding: BranchBinding): Promise<void> {
    if (binding.providerId === "reef-kroger") { await this.search(binding, "brown rice"); return; } // Search echoes the physical store; checked below.
    const response = await this.call(binding, "stores", { banner: binding.banner!, postal_code: binding.address.postalCode.replace(/\s/g, "").slice(0, 3), limit: 50 });
    const parsed = z.object({ banner: z.string(), stores: z.array(z.object({ store_id: z.string(), banner: z.string(), address: z.string(), postal_code: z.string(), city: z.string(), sells_online: z.boolean(), pickup_type: z.string() })).max(50) }).safeParse(response.data);
    if (!parsed.success || parsed.data.banner !== binding.banner) throw retailFailure();
    const branch = parsed.data.stores.find(store => store.store_id === binding.providerStoreId && store.banner === binding.banner && store.sells_online && store.pickup_type === "STORE");
    if (!branch || !addressMatches({ line1: branch.address.split(",")[0]!, postalCode: branch.postal_code, country: "CA" }, binding)) throw retailFailure();
  }
  async search(binding: BranchBinding, query: string): Promise<RetailProductObservation[]> {
    if (query.trim().length < 2 || query.length > 120) throw retailFailure();
    const response = await this.call(binding, "search", binding.providerId === "reef-loblaws"
      ? { query, banner: binding.banner!, store_id: binding.providerStoreId, page_size: 12, page: 1 }
      : { query, location_id: binding.providerStoreId });
    if (binding.providerId === "reef-loblaws") {
      const parsed = z.object({ banner: z.string(), store_id: z.string(), store_defaulted: z.literal(false), results: z.array(z.unknown()).max(30) }).safeParse(response.data);
      if (!parsed.success || parsed.data.banner !== binding.banner || parsed.data.store_id !== binding.providerStoreId || binding.channel !== "pickup") throw retailFailure();
      return parsed.data.results.flatMap(raw => {
        const row = canadaRow.safeParse(raw); if (!row.success) return [];
        const item = row.data; const current = decimalMoney(item.price, "CAD"); const original = decimalMoney(item.original_price, "CAD");
        const regular = original && current && original.amountCents > current.amountCents ? original : current;
        const promotions: Promotion[] = [];
        if (current && original && current.amountCents < original.amountCents) promotions.push({ type: item.deal?.type === "sale" && !item.multi_buy ? "unconditional-sale" : "unknown",
          price: current, validFrom: null, validTo: item.deal?.expires ?? null, minimumQuantity: 1, membershipRequired: false, couponRequired: false, conditions: item.deal?.text ?? null });
        const member = decimalMoney(item.member_price, "CAD");
        if (member) promotions.push({ type: "loyalty", price: member, validFrom: null, validTo: null, minimumQuantity: 1, membershipRequired: true, couponRequired: false, conditions: "PC Optimum membership price" });
        const quantity = parsePackage(item.package_size, "CA");
        return [{ providerId: "reef-loblaws", retailer: binding.retailer, country: "CA", providerStoreId: binding.providerStoreId,
          productId: item.product_id, gtin: normalizeGtin(item.gtin), name: item.title, brand: item.brand, category: item.category ?? null,
          packageLabel: item.package_size, packageQuantity: quantity, regularPrice: regular, regularPriceIsCurrent: regular === current, promotionalPrice: original && current && original.amountCents > current.amountCents ? current : null,
          promotions, unitPrice: regular && quantity ? { price: regular, per: quantity } : null,
          availability: ["in_stock", "low_stock"].includes(item.stock_status) ? "available" : item.stock_status === "out_of_stock" ? "unavailable" : "unknown",
          channel: "pickup", scope: "branch", priceIsEstimate: item.price_is_estimate || item.sold_by !== "piece",
          retrievedAt: response.retrievedAt, sourceObservedAt: response.sourceObservedAt, providerUpdatedAt: response.providerUpdatedAt, expiresAt: response.expiresAt, sourceUrl: safeProductUrl(item.url) }];
      });
    }
    const parsed = z.object({ store: z.object({ location_id: z.string(), banner_name: z.string(), address: z.object({ lines: z.array(z.string()).min(1), postal_code: z.string(), country: z.string() }) }), results: z.array(z.unknown()).max(24) }).safeParse(response.data);
    if (!parsed.success || parsed.data.store.location_id !== binding.providerStoreId || binding.channel !== "in-store"
      || canonicalName(parsed.data.store.banner_name) !== canonicalName(binding.retailer)
      || !addressMatches({ line1: parsed.data.store.address.lines[0]!, postalCode: parsed.data.store.address.postal_code, country: parsed.data.store.address.country }, binding)) throw retailFailure();
    return parsed.data.results.flatMap(raw => {
      const row = usRow.safeParse(raw); if (!row.success) return [];
      const item = row.data; const regular = decimalMoney(item.regular_price, "USD"); const sale = decimalMoney(item.sale_price, "USD");
      const quantity = parsePackage(item.size, "US");
      return [{ providerId: "reef-kroger", retailer: binding.retailer, country: "US", providerStoreId: binding.providerStoreId, productId: item.upc, gtin: normalizeGtin(item.gtin14),
        name: item.title, brand: item.brand, category: item.category ?? null, packageLabel: item.size, packageQuantity: quantity,
        regularPrice: regular, regularPriceIsCurrent: Boolean(regular), promotionalPrice: sale, promotions: sale ? [{ type: "loyalty", price: sale, validFrom: null, validTo: item.sale_ends_at ?? null,
          minimumQuantity: null, membershipRequired: true, couponRequired: false, conditions: "Kroger-card sale eligibility is not assumed." }] : [],
        unitPrice: regular && quantity ? { price: regular, per: quantity } : null,
        availability: (item.available_to_sell !== null && item.available_to_sell !== undefined && item.available_to_sell <= 0) || item.stock_level === "TEMPORARILY_OUT_OF_STOCK" ? "unavailable" : ["HIGH", "LOW"].includes(item.stock_level ?? "") && item.ways_to_shop?.in_store === true ? "available" : "unknown",
        channel: "in-store" as PriceChannel, scope: "branch", priceIsEstimate: item.price_is_estimate || item.sold_by !== "Unit", retrievedAt: response.retrievedAt, sourceObservedAt: response.sourceObservedAt,
        providerUpdatedAt: response.providerUpdatedAt, expiresAt: response.expiresAt, sourceUrl: safeProductUrl(item.url) }];
    });
  }
}
