import type { Store } from "@/contracts";

export interface StoreShoppingOption {
  retailerName: string;
  searchUrl: (query: string) => string;
}

const search = (retailerName: string, base: string): StoreShoppingOption => ({
  retailerName, searchUrl: query => `${base}${encodeURIComponent(query.trim())}`,
});

/** Retailer-wide public searches, never branch inventory or cart integrations.
 * Only exact supported country/chain pairs can receive product-search actions.
 */
export function storeShoppingOption(store: Store): StoreShoppingOption | null {
  if (store.source !== "google") return null;
  if (store.country === "CA") {
    if (store.chainId === "ca-walmart") return search("Walmart Canada", "https://www.walmart.ca/en/search?q=");
    if (store.chainId === "ca-no-frills") return search("No Frills", "https://www.nofrills.ca/en/search?search-bar=");
    if (store.chainId === "ca-loblaws") return search("Loblaws", "https://www.loblaws.ca/en/search?search-bar=");
  }
  if (store.country === "US") {
    if (store.chainId === "us-walmart") return search("Walmart US", "https://www.walmart.com/search?q=");
    if (store.chainId === "us-kroger") return search("Kroger", "https://www.kroger.com/search?query=");
  }
  return null;
}

export function storeSearchLink(store: Store, ingredientName: string): { name: string; url: string } | null {
  const option = storeShoppingOption(store);
  return option && ingredientName.trim() ? { name: option.retailerName, url: option.searchUrl(ingredientName) } : null;
}

/** Known public home pages are distinct from verified ingredient-search routes. */
export function storeWebsiteLink(store: Store): { name: string; url: string } | null {
  const option = storeShoppingOption(store);
  if (option) return { name: option.retailerName, url: new URL(option.searchUrl("groceries")).origin };
  if (store.source !== "google") return null;
  if (store.country === "CA" && store.name.trim().toLowerCase() === "farm boy") return { name: "Farm Boy", url: "https://www.farmboy.ca/" };
  return null;
}

/** Public Maps directions resolve the selected place; no driving time is inferred. */
export function storeDirectionsLink(store: Store): string | null {
  if (store.source !== "google") return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${store.name}, ${store.address}`);
  url.searchParams.set("destination_place_id", store.googlePlaceId);
  return url.href;
}
