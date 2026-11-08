import type { StorePricingResult } from "@/contracts";
import type { ResolvedStore } from "@/server/discovery/provider";

/** Agent C owns pricing calculations. This boundary can later use a real retailer feed. */
export interface GroceryPricingProvider {
  getOffers(store: ResolvedStore, productIds: readonly string[]): Promise<StorePricingResult>;
}
