import type { StoreDiscoveryResult, StoreDiscoveryResultV2, StoreV2 } from "@/contracts";
import { matchGroceryBanner } from "@/server/discovery/chains";

/** Selection never consults pricing capability. Alternatives remain in stores. */
export function automaticStoreSelection(result: StoreDiscoveryResult, stores: StoreV2[]): StoreDiscoveryResultV2 {
  const ordered = [...stores].sort((a, b) => a.source === "google" && b.source === "google"
    ? a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id, "en") : 0);
  const banners = new Set<string>();
  const selectedStoreIds: string[] = [];
  for (const store of ordered) {
    const banner = store.source === "demo" ? store.id : matchGroceryBanner(store.name, store.country)?.id;
    if (!banner || banners.has(banner)) continue;
    banners.add(banner);
    selectedStoreIds.push(store.id);
    if (selectedStoreIds.length === 3) break;
  }
  return { ...result, stores, selectedStoreIds,
    selection: { strategy: result.mode === "live" ? "nearest-distinct-banners" : "demo-order", limit: 3,
      distanceBasis: result.mode === "live" ? "straight-line" : null, exhaustive: false, candidateLimit: result.mode === "live" ? 20 : null } };
}
