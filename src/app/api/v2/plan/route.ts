import { planningRequestV2Schema, type PlanningResultV2 } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { automaticStoreSelection } from "@/server/discovery/selection";
import { checkCatalogVersion, createRetailPricingService } from "@/server/pricing/service";
import { invalidRequest, ServiceError } from "@/server/errors";
import { bodyV2, failureV2, successV2 } from "@/server/http-v2";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const parsed = await bodyV2(request, planningRequestV2Schema);
  if (!parsed.ok) return parsed.response;
  try {
    const input = parsed.data;
    checkCatalogVersion(input.catalogVersion);
    if (input.preferences.excludedIngredientIds.some(id => !ingredients.some(item => item.id === id))) invalidRequest("preferences.excludedIngredientIds", "Choose known catalog ingredients.");
    const provider = input.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    const found = await provider.discover({ mode: input.mode, location: input.location, radiusKm: input.radiusKm });
    // Select first, before any retailer request; failed pricing never changes the chosen stores.
    const discovery = automaticStoreSelection(found, found.stores.map(store => ({ ...store, pricing: store.source === "demo" && store.pricing.status === "illustrative"
      ? store.pricing : { status: "unavailable" as const, profileId: null, reason: "Pricing has not yet been checked." } })));
    const selectedStoreIds = input.storeIds ?? discovery.selectedStoreIds;
    if (selectedStoreIds.some(id => !discovery.stores.some(store => store.id === id))) invalidRequest("storeIds", "Choose eligible stores returned by this location search.");
    const selected = selectedStoreIds.map(id => found.stores.find(store => store.id === id)!);
    const result: PlanningResultV2 = { status: "no-stores", discovery, selectedStoreIds, optimization: null, pricingError: null };
    if (!selected.length) return successV2(result);
    try {
      result.optimization = await createRetailPricingService().optimize({ mode: input.mode, country: input.location.country, storeIds: selectedStoreIds, preferences: input.preferences }, selected);
      const optimization = result.optimization;
      result.status = optimization.status === "feasible" || optimization.mixedStorePlan ? "planned"
        : optimization.status === "infeasible" && optimization.reason === "pricing-unavailable" ? "pricing-unavailable" : "no-plan";
      for (const store of discovery.stores) {
        const prices = optimization.pricing.stores.find(item => item.storeId === store.id);
        if (prices?.status === "available" && prices.basis === "verified" && prices.offers[0]) store.pricing = { status: "verified-capable", providerId: prices.offers[0].provenance.providerId, channel: prices.offers[0].provenance.channel };
        else if (prices?.status === "unavailable") store.pricing = { status: "unavailable", profileId: null, reason: prices.message };
      }
    } catch (error) {
      if (!(error instanceof ServiceError) || !["provider-not-configured", "provider-error", "rate-limited"].includes(error.error.code)) throw error;
      result.status = "pricing-unavailable";
      result.pricingError = error.error;
      for (const store of discovery.stores) if (selectedStoreIds.includes(store.id)) store.pricing = { status: "unavailable", profileId: null, reason: error.error.message };
    }
    return successV2(result);
  } catch (error) { return failureV2(error); }
}
