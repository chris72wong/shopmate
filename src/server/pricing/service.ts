import "server-only";
import { createHash } from "node:crypto";
import { currencyForCountry, type Country, type DataMode, type OptimizationRequest, type OptimizationResultV2, type PricingResultV2, type PricingSetV2, type RetailProductObservation, type Store, type StorePricingV2 } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { recipes } from "@/data/recipes";
import { products } from "@/data/pricing";
import { invalidRequest, ServiceError } from "@/server/errors";
import type { ResolvedStore } from "@/server/discovery/provider";
import { illustrativePricing } from "@/server/pricing/illustrative";
import { bindingForStore, loadRetailConfig, type BranchBinding, type RetailConfig } from "@/server/pricing/retail-config";
import { matchVerifiedOffer } from "@/server/pricing/matching";
import { ReefPricingAdapter } from "@/server/pricing/reef";
import { createPackageOptimizer, DEFAULT_EVALUATION_LIMIT, OPTIMIZER_VERSION, type EngineOptions, type PackageSnapshot } from "@/server/optimization/engine";

export const CATALOG_VERSION = `catalog-${createHash("sha256").update(JSON.stringify({ ingredients, recipes, products })).digest("hex").slice(0, 16)}`;
export function checkCatalogVersion(version: string): void { if (version !== CATALOG_VERSION) invalidRequest("catalogVersion", "The catalog changed. Reload /api/v2/catalog before continuing."); }
export function catalog(country: Country) { return { catalogVersion: CATALOG_VERSION, country, currency: currencyForCountry(country), ingredients, recipes, products: products.filter(product => product.countries.includes(country)) }; }
export interface RetailAdapter {
  configured(): boolean;
  verifyBranch(binding: BranchBinding): Promise<void>;
  search(binding: BranchBinding, query: string): Promise<RetailProductObservation[]>;
}
interface PricingOptions { config?: RetailConfig; adapter?: RetailAdapter; now?: () => number; engineOptions?: EngineOptions }
export function createRetailPricingService(options: PricingOptions = {}) {
  const adapter = options.adapter ?? new ReefPricingAdapter();
  const now = options.now ?? Date.now;
  const readConfig = () => options.config ?? loadRetailConfig();
  function validateStores(mode: DataMode, country: Country, stores: readonly ResolvedStore[]) {
    if (!stores.length || stores.length > 3 || stores.some(store => store.country !== country || store.source !== (mode === "demo" ? "demo" : "google"))) invalidRequest("storeIds", "Resolve selected stores in the same country and mode.");
  }
  async function pricing(mode: DataMode, country: Country, stores: readonly ResolvedStore[]): Promise<PricingResultV2> {
    validateStores(mode, country, stores);
    const currency = currencyForCountry(country);
    const config = mode === "live" ? readConfig() : { bindings: [], mappings: [] };
    const deadline = now() + 20_000;
    const withinDeadline = () => { if (now() >= deadline) throw new ServiceError(502, { code: "provider-error", message: "The overall pricing deadline was reached." }); };
    const results: PricingSetV2[] = [];
    // At most 12 reviewed SKU searches per store. Sequential calls avoid provider bursts.
    for (const store of stores) {
      if (mode === "demo") {
        const snapshot = await illustrativePricing.getOffers(store, products.filter(product => product.countries.includes(country)).map(product => product.id));
        results.push(snapshot.status === "unavailable" ? { status: "unavailable", storeId: store.id, reason: "no-usable-offers", message: snapshot.reason }
          : { ...snapshot, missingIngredientIds: ingredients.filter(ingredient => !snapshot.offers.some(offer => products.some(product => product.id === offer.productId && product.ingredientId === ingredient.id))).map(ingredient => ingredient.id).sort() });
        continue;
      }
      const binding = bindingForStore(store, config);
      if (!binding) { results.push({ status: "unavailable", storeId: store.id, reason: "unsupported-store", message: "No verified provider mapping exists for this physical branch." }); continue; }
      if (!adapter.configured()) { results.push({ status: "unavailable", storeId: store.id, reason: "provider-not-configured", message: "Real pricing requires a server-side ReefAPI key." }); continue; }
      try {
        withinDeadline();
        await adapter.verifyBranch(binding);
        const mappings = config.mappings.filter(item => item.providerId === binding.providerId && item.retailer === binding.retailer).slice(0, 12);
        const offers: Extract<PricingSetV2, { basis: "verified" }>["offers"] = [];
        for (const mapping of mappings) {
          withinDeadline();
          const ingredient = ingredients.find(item => item.id === mapping.ingredientId);
          if (!ingredient) throw new ServiceError(503, { code: "provider-not-configured", message: "A reviewed product mapping references an unknown ingredient." });
          const observations = await adapter.search(binding, mapping.expectedName);
          const matches = observations.flatMap(observation => { const offer = matchVerifiedOffer(observation, mapping, binding, ingredient, now()); return offer ? [offer] : []; });
          // Name-only matching must be unambiguous. Never choose the cheapest loosely related row.
          if (matches.length === 1 && !offers.some(offer => offer.product.id === matches[0]!.product.id)) offers.push(matches[0]!);
        }
        const fresh = offers.filter(offer => Date.parse(offer.provenance.expiresAt) > now());
        results.push(fresh.length ? { status: "available", storeId: store.id, basis: "verified", offers: fresh,
          missingIngredientIds: ingredients.filter(ingredient => !fresh.some(offer => offer.product.ingredientId === ingredient.id)).map(item => item.id).sort() }
          : { status: "unavailable", storeId: store.id, reason: "no-usable-offers", message: "No fresh, available products match the reviewed ingredient and package mappings at this branch." });
      } catch (error) {
        const code = error instanceof ServiceError ? error.error.code : "provider-error";
        results.push({ status: "unavailable", storeId: store.id, reason: code === "rate-limited" ? "rate-limited" : code === "provider-not-configured" ? "provider-not-configured" : "provider-error",
          message: "Real pricing could not be verified at this branch. Sample prices were not substituted." });
      }
    }
    // A quote from the first branch may expire while a later branch is fetched.
    const completedAt = now();
    for (const [index, result] of results.entries()) if (result.status === "available" && result.basis === "verified") {
      const offers = result.offers.filter(offer => Date.parse(offer.provenance.expiresAt) > completedAt);
      results[index] = offers.length ? { ...result, offers, missingIngredientIds: ingredients.filter(ingredient => !offers.some(offer => offer.product.ingredientId === ingredient.id)).map(item => item.id).sort() }
        : { status: "unavailable", storeId: result.storeId, reason: "no-usable-offers", message: "Quotes expired before all selected branches could be checked. Request fresh prices." };
    }
    if (mode === "live" && !results.some(result => result.status === "available")) {
      const failures = results.filter(result => result.status === "unavailable" && ["provider-error", "rate-limited", "provider-not-configured"].includes(result.reason));
      if (failures.length) {
        const has = (reason: string) => failures.some(result => result.status === "unavailable" && result.reason === reason);
        if (has("provider-error")) throw new ServiceError(502, { code: "provider-error", message: "No selected branch returned usable real pricing." });
        if (has("rate-limited")) throw new ServiceError(429, { code: "rate-limited", message: "Retail pricing limits were reached. Try again later." });
        throw new ServiceError(503, { code: "provider-not-configured", message: "Real pricing credentials are missing for the supported selected stores." });
      }
    }
    const channels = new Set(results.flatMap(result => result.status === "available" && result.basis === "verified" ? result.offers.map(offer => offer.provenance.channel) : []));
    if (channels.size > 1) invalidRequest("storeIds", "Choose stores with the same price channel. In-store, pickup and delivery baskets cannot be compared together.");
    return { mode, country, currency, catalogVersion: CATALOG_VERSION, stores: results,
      notices: mode === "demo" ? ["Fictional demo stores and illustrative prices only."] : ["Real quotes are limited to reviewed products at verified physical branches in one price channel.",
        "At most 12 reviewed product searches per store per run. Missing or unqueried ingredients remain unavailable.",
        "Loyalty, coupons, multi-buy, estimated variable-weight and expired prices are excluded. Taxes, fees and deposits are excluded.", "Retailer quotes may change before checkout. Nutrition and allergen metadata remain sample estimates."] };
  }
  async function optimize(request: OptimizationRequest, stores: readonly ResolvedStore[]): Promise<OptimizationResultV2> {
    if (request.preferences.excludedIngredientIds.some(id => !ingredients.some(item => item.id === id))) invalidRequest("preferences.excludedIngredientIds", "Choose known catalog ingredients.");
    const prices = await pricing(request.mode, request.country, stores);
    const basis = request.mode === "demo" ? "illustrative" : "verified";
    const snapshots: PackageSnapshot[] = prices.stores.map(snapshot => {
      if (snapshot.status === "unavailable") return { storeId: snapshot.storeId, packages: [], unavailable: snapshot.message };
      if (snapshot.basis === "verified") return { storeId: snapshot.storeId, packages: snapshot.offers.map(offer => ({ product: offer.product, price: offer.price })) };
      return { storeId: snapshot.storeId, packages: snapshot.offers.flatMap(offer => { const product = products.find(item => item.id === offer.productId); return product ? [{ product, price: offer.price }] : []; }) };
    });
    let candidateRecipeIds: string[] = [];
    const engine = createPackageOptimizer(basis, { ...options.engineOptions, onCandidates: ids => { candidateRecipeIds = ids; } });
    const result = await engine(request, stores, async () => snapshots);
    if (result.status === "feasible") for (const basket of result.baskets) if (basket.status === "complete" && basket.basis === "verified") {
      const priced = prices.stores.find(item => item.storeId === basket.storeId);
      if (priced?.status !== "available" || priced.basis !== "verified" || basket.lines.some(line => !priced.offers.some(offer => offer.product.id === line.productId && Date.parse(offer.provenance.expiresAt) > now()))) throw new ServiceError(502, { code: "provider-error", message: "Prices expired during planning. Please request a fresh plan." });
    }
    return { ...result, catalogVersion: CATALOG_VERSION, optimizerVersion: OPTIMIZER_VERSION, pricing: prices,
      search: { ...result.search, evaluationLimit: options.engineOptions?.evaluationLimit ?? DEFAULT_EVALUATION_LIMIT, candidateRecipeIds } };
  }
  async function storePricing(store: Store): Promise<StorePricingV2> {
    if (store.source === "demo") return store.pricing.status === "illustrative" ? store.pricing : { ...store.pricing, reason: "No sample pricing profile is available." };
    const binding = bindingForStore(store, readConfig());
    if (binding && adapter.configured()) {
      try { await adapter.verifyBranch(binding); return { status: "verified-capable" as const, providerId: binding.providerId, channel: binding.channel }; } catch { /* Explicit unavailable state below. */ }
    }
    return { status: "unavailable" as const, profileId: null, reason: "Real pricing is unavailable or not verified for this physical branch." };
  }
  return { pricing, optimize, storePricing };
}
