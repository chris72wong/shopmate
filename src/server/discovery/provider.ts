import type { Country, Store, StoreDiscoveryRequest, StoreDiscoveryResult } from "@/contracts";

/** Agent B owns implementations. Keep credentials and Google requests on the server. */
export interface StoreDiscoveryProvider {
  discover(request: StoreDiscoveryRequest): Promise<StoreDiscoveryResult>;
  /** Resolve IDs again on the server; do not trust client-supplied chain or price metadata. */
  resolveStores(storeIds: readonly string[], country: Country): Promise<Store[]>;
}
