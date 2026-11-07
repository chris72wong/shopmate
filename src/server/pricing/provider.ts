import type { Store, StorePricingResult } from "@/contracts";

/** Agent C owns pricing calculations. This boundary can later use a real retailer feed. */
export interface GroceryPricingProvider {
  getOffers(store: Store, productIds: readonly string[]): Promise<StorePricingResult>;
}
