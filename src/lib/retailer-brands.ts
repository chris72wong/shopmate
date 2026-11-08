import type { Store } from "@/contracts";
import { matchGroceryBanner } from "@/server/discovery/chains";

export type RetailerIdentity = Pick<Store, "name" | "country" | "source" | "chainId">;

/** Banner domains, never parent-company domains or individual branch websites.
 * The existing pure name matcher contains no provider code or secrets.
 * Display identity is independent of pricing support. See docs/RETAILER-LOGOS.md.
 */
export const retailerDomains: Readonly<Record<string, string>> = {
  "ca-loblaws": "loblaws.ca",
  "ca-no-frills": "nofrills.ca",
  "ca-real-canadian-superstore": "realcanadiansuperstore.ca",
  "ca-atlantic-superstore": "atlanticsuperstore.ca",
  "ca-zehrs": "zehrs.ca",
  "ca-fortinos": "fortinos.ca",
  "ca-your-independent-grocer": "yourindependentgrocer.ca",
  "ca-valu-mart": "valumart.ca",
  "ca-provigo": "provigo.ca",
  "ca-maxi": "maxi.ca",
  "ca-dominion": "dominionstores.ca",
  "ca-sobeys": "sobeys.com",
  "ca-safeway": "safeway.ca",
  "ca-iga": "iga.ca",
  "ca-foodland": "foodland.ca",
  "ca-freshco": "freshco.com",
  "ca-thrifty-foods": "thriftyfoods.com",
  "ca-longos": "longos.com",
  "ca-farm-boy": "farmboy.ca",
  "ca-metro": "metro.ca",
  "ca-food-basics": "foodbasics.ca",
  "ca-super-c": "superc.ca",
  "ca-save-on-foods": "saveonfoods.com",
  "ca-walmart": "walmart.ca",
  "us-walmart": "walmart.com",
  "us-aldi": "aldi.us",
  "us-lidl": "lidl.com",
  "us-kroger": "kroger.com",
  "us-ralphs": "ralphs.com",
  "us-fred-meyer": "fredmeyer.com",
  "us-frys": "frysfood.com",
  "us-king-soopers": "kingsoopers.com",
  "us-city-market": "citymarket.com",
  "us-smiths": "smithsfoodanddrug.com",
  "us-dillons": "dillons.com",
  "us-bakers": "bakersplus.com",
  "us-gerbes": "gerbes.com",
  "us-qfc": "qfc.com",
  "us-pick-n-save": "picknsave.com",
  "us-metro-market": "metromarket.net",
  "us-marianos": "marianos.com",
  "us-food-4-less": "food4less.com",
  "us-foods-co": "foodsco.net",
  "us-jay-c": "jaycfoods.com",
  "us-pay-less": "pay-less.com",
  "us-harris-teeter": "harristeeter.com",
  "us-albertsons": "albertsons.com",
  "us-safeway": "safeway.com",
  "us-vons": "vons.com",
  "us-pavilions": "pavilions.com",
  "us-jewel-osco": "jewelosco.com",
  "us-acme": "acmemarkets.com",
  "us-shaws": "shaws.com",
  "us-star-market": "starmarket.com",
  "us-tom-thumb": "tomthumb.com",
  "us-randalls": "randalls.com",
  "us-united-supermarkets": "unitedsupermarkets.com",
  "us-market-street": "marketstreetunited.com",
  "us-carrs": "carrsqc.com",
  "us-haggen": "haggen.com",
  "us-food-lion": "foodlion.com",
  "us-hannaford": "hannaford.com",
  "us-stop-and-shop": "stopandshop.com",
  "us-publix": "publix.com",
  "us-heb": "heb.com",
  "us-meijer": "meijer.com",
  "us-wegmans": "wegmans.com",
  "us-winco": "wincofoods.com",
  "us-hy-vee": "hy-vee.com",
  "us-shoprite": "shoprite.com",
  "us-giant-eagle": "gianteagle.com",
  "us-grocery-outlet": "groceryoutlet.com",
  "us-save-a-lot": "savealot.com",
};

export function retailerDomain(store: RetailerIdentity): string | null {
  if (store.source !== "google") return null;
  const banner = matchGroceryBanner(store.name, store.country);
  if (store.country === "US" && store.name.trim().toLowerCase() === "albertsons market") return "albertsonsmarket.com";
  if (store.country === "US" && /^(giant eagle )?market district$/i.test(store.name.trim())) return "marketdistrict.com";
  // The discovery groups overlap for these unrelated regional retailers.
  // Only unambiguous names get a mark; bare "Giant" / "Martin's" keep initials.
  if (banner?.id === "us-giant" || banner?.id === "us-martins") {
    const name = store.name.replace(/[’‘]/g, "'").trim().toLowerCase();
    if (name === "giant food") return "giantfood.com";
    if (name === "giant food stores") return "giantfoodstores.com";
    if (name === "martin's food markets") return "martinsfoods.com";
    if (name === "martin's super markets") return "martinsgroceriestogo.com";
    return null;
  }
  return retailerDomains[banner?.id ?? store.chainId ?? ""] ?? null;
}

export function retailerLogoUrl(domain: string | null, clientId: string | undefined): string | null {
  if (!domain || !clientId?.trim()) return null;
  // A fixed, allowlisted domain is the only retailer information sent to the CDN.
  const allowed = [...Object.values(retailerDomains), "giantfood.com", "giantfoodstores.com", "martinsfoods.com", "martinsgroceriestogo.com", "albertsonsmarket.com", "marketdistrict.com"];
  if (!allowed.includes(domain)) return null;
  return `https://cdn.brandfetch.io/domain/${domain}/w/240/h/120/theme/dark/fallback/404/type/logo?c=${encodeURIComponent(clientId.trim())}`;
}

export function retailerInitials(name: string): string {
  return name.trim().split(/\s+/u).slice(0, 2).map(word => [...word][0] ?? "").join("").toLocaleUpperCase("en").slice(0, 2) || "SM";
}
