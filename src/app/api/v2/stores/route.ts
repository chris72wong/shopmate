import { storeDiscoveryRequestSchema, type StoreV2 } from "@/contracts";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { createRetailPricingService } from "@/server/pricing/service";
import { bodyV2, failureV2, successV2 } from "@/server/http-v2";
import { automaticStoreSelection } from "@/server/discovery/selection";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  const parsed = await bodyV2(request, storeDiscoveryRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const provider = parsed.data.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    const result = await provider.discover(parsed.data);
    const pricing = createRetailPricingService();
    const stores: StoreV2[] = [];
    const deadline = Date.now() + 20_000;
    for (const store of result.stores) stores.push({ ...store, pricing: Date.now() < deadline ? await pricing.storePricing(store)
      : { status: "unavailable", profileId: null, reason: "Pricing verification was not completed within this search. Try pricing the selected stores." } });
    return successV2(automaticStoreSelection({ ...result, notices: parsed.data.mode === "demo" ? result.notices : [...result.notices, "The three closest returned eligible banners are automatically selected, regardless of pricing coverage. You can choose other returned stores.", "Real pricing is available only for verified physical-branch mappings. Other stores remain unavailable. No sample prices are used in live planning."] }, stores));
  } catch (error) { return failureV2(error); }
}
