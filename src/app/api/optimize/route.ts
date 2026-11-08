import { optimizationRequestSchema } from "@/contracts";
import { ingredients } from "@/data/ingredients";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { optimizationEngine } from "@/server/optimization/engine";
import { illustrativePricing } from "@/server/pricing/illustrative";
import { invalidRequest, serviceFailure } from "@/server/errors";
import { parseBody, success } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, optimizationRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    if (parsed.data.preferences.excludedIngredientIds.some(id => !ingredients.some(item => item.id === id))) {
      invalidRequest("preferences.excludedIngredientIds", "Choose only known catalog ingredients.");
    }
    const discovery = parsed.data.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    const stores = await discovery.resolveStores(parsed.data.storeIds, parsed.data.country);
    return success(await optimizationEngine.optimize(parsed.data, stores, illustrativePricing));
  } catch (error) { return serviceFailure(error); }
}
