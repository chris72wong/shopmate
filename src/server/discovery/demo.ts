import "server-only";
import { currencyForCountry, locationInputSchema } from "@/contracts";
import { getDemoStores } from "@/data/demo-stores";
import type { StoreDiscoveryProvider } from "./provider";
import { invalidRequest } from "@/server/errors";

export const demoStoreDiscovery: StoreDiscoveryProvider = {
  async discover(request) {
    if (request.mode !== "demo") throw new Error("Demo discovery requires explicit demo mode.");
    const location = locationInputSchema.parse(request.location);
    return {
      mode: "demo", location: { ...location, currency: currencyForCountry(location.country) },
      origin: { label: "Fictional demo area", coordinates: null },
      radiusKm: request.radiusKm, stores: getDemoStores(location.country), attributions: [],
      notices: [
        "These stores and addresses are fictional, not nearby search results.",
        "Location and radius do not filter the fictional demo stores.",
        "All grocery prices are illustrative samples, not live retailer prices.",
      ],
    };
  },
  async resolveStores(ids, country) {
    const stores = getDemoStores(country);
    if (new Set(ids).size !== ids.length || ids.length < 1 || ids.length > 3) {
      invalidRequest("storeIds", "Select one to three different demo stores.");
    }
    return ids.map((id) => {
      const store = stores.find((entry) => entry.id === id);
      if (!store) invalidRequest("storeIds", "Unknown demo store for this country.");
      return store;
    });
  },
};
