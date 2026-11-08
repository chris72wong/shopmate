import { optimizationRequestV2Schema } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { checkCatalogVersion, createRetailPricingService } from "@/server/pricing/service";
import { invalidRequest } from "@/server/errors";
import { bodyV2, failureV2, successV2 } from "@/server/http-v2";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const parsed = await bodyV2(request, optimizationRequestV2Schema);
  if (!parsed.ok) return parsed.response;
  try {
    const { catalogVersion, ...input } = parsed.data;
    checkCatalogVersion(catalogVersion);
    if (input.preferences.excludedIngredientIds.some(id => !ingredients.some(item => item.id === id))) invalidRequest("preferences.excludedIngredientIds", "Choose known catalog ingredients.");
    const resolver = input.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    const stores = await resolver.resolveStores(input.storeIds, input.country);
    return successV2(await createRetailPricingService().optimize(input, stores));
  } catch (error) { return failureV2(error); }
}
