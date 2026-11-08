import type { Country, Store, StoreDiscoveryRequest, StoreDiscoveryResult } from "@/contracts";

/** Internal pricing identity. Resolution has no original search origin, so it cannot invent a distance. */
export type ResolvedStore = Pick<Store, "id" | "name" | "address" | "country" | "chainId" | "pricing" | "source">;

/** Agent B owns implementations. Keep credentials and Google requests on the server. */
export interface StoreDiscoveryProvider {
  discover(request: StoreDiscoveryRequest): Promise<StoreDiscoveryResult>;
  /** Resolve IDs again on the server; do not trust client-supplied chain or price metadata. */
  resolveStores(storeIds: readonly string[], country: Country): Promise<ResolvedStore[]>;
}
