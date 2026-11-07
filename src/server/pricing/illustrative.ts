import "server-only";
import { offers, pricingProfiles, products } from "@/data/pricing";
import type { GroceryPricingProvider } from "./provider";

export const illustrativePricing: GroceryPricingProvider = {
  async getOffers(store, productIds) {
    if (store.pricing.status === "unavailable") {
      return { status: "unavailable", storeId: store.id, reason: "No illustrative pricing profile is available for this store." };
    }
    const profile = pricingProfiles.find((item) => item.id === store.pricing.profileId);
    const validSource = profile && (store.source === "demo"
      ? profile.chainId === null && profile.id === store.id
      : profile.chainId !== null && profile.chainId === store.chainId);
    if (!profile || profile.country !== store.country || !validSource) {
      return { status: "unavailable", storeId: store.id, reason: "The store has no matching pricing profile in this country." };
    }
    const requested = new Set(productIds);
    const countryProducts = new Set(products.filter((item) => item.countries.includes(store.country)).map((item) => item.id));
    return { status: "available", storeId: store.id, basis: "illustrative",
      offers: offers.filter((offer) => offer.profileId === profile.id && requested.has(offer.productId)
        && countryProducts.has(offer.productId) && offer.available) };
    // Missing requested products remain missing. A future basket calculator must reject incomplete baskets.
  },
};
