import { pricingRequestV2Schema } from "@/contracts";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { checkCatalogVersion, createRetailPricingService } from "@/server/pricing/service";
import { bodyV2, failureV2, successV2 } from "@/server/http-v2";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const parsed = await bodyV2(request, pricingRequestV2Schema);
  if (!parsed.ok) return parsed.response;
  try {
    checkCatalogVersion(parsed.data.catalogVersion);
    const resolver = parsed.data.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    const stores = await resolver.resolveStores(parsed.data.storeIds, parsed.data.country);
    return successV2(await createRetailPricingService().pricing(parsed.data.mode, parsed.data.country, stores));
  } catch (error) { return failureV2(error); }
}
