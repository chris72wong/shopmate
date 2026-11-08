import type { ChainId, Country } from "@/contracts";

/** Internal grouping identities never expand the public ChainId/pricing-profile contract. */
export interface GroceryBanner { id: string; chainId: ChainId | null }

const walmart = ["Walmart", "Walmart Supercentre", "Walmart Supercenter"];
const banners: Record<Country, Record<string, readonly string[]>> = {
  CA: {
    loblaws: ["Loblaws", "Loblaws City Market", "Loblaws CityMarket"],
    "no-frills": ["No Frills", "Nofrills"],
    "real-canadian-superstore": ["Real Canadian Superstore"],
    "atlantic-superstore": ["Atlantic Superstore"],
    zehrs: ["Zehrs", "Zehrs Markets", "Zehrs Great Food"],
    fortinos: ["Fortinos"],
    "your-independent-grocer": ["Your Independent Grocer"],
    "valu-mart": ["Valu-Mart", "Valumart"],
    provigo: ["Provigo", "Provigo Le Marché"],
    maxi: ["Maxi", "Maxi & Cie", "Maxi et Cie"],
    dominion: ["Dominion"],
    sobeys: ["Sobeys", "Sobeys Extra", "Sobeys Urban Fresh"],
    safeway: ["Safeway"],
    iga: ["IGA", "IGA Extra"],
    foodland: ["Foodland"],
    freshco: ["FreshCo", "Fresh Co", "Chalo! FreshCo"],
    "thrifty-foods": ["Thrifty Foods"],
    longos: ["Longo’s", "The Market by Longo’s"],
    "farm-boy": ["Farm Boy"],
    metro: ["Metro", "Metro Plus"],
    "food-basics": ["Food Basics"],
    "super-c": ["Super C"],
    "save-on-foods": ["Save-On-Foods"],
    walmart,
  },
  US: {
    walmart: [...walmart, "Walmart Neighborhood Market"],
    aldi: ["ALDI"],
    lidl: ["Lidl"],
    kroger: ["Kroger", "Kroger Marketplace"],
    ralphs: ["Ralphs", "Ralphs Fresh Fare"],
    "fred-meyer": ["Fred Meyer"],
    frys: ["Fry’s", "Fry’s Food and Drug", "Fry’s Food Stores", "Fry’s Marketplace"],
    "king-soopers": ["King Soopers", "King Soopers Marketplace"],
    "city-market": ["City Market"],
    smiths: ["Smith’s", "Smith’s Food and Drug", "Smith’s Marketplace"],
    dillons: ["Dillons", "Dillons Food Store", "Dillons Marketplace"],
    bakers: ["Baker’s"],
    gerbes: ["Gerbes", "Gerbes Super Markets"],
    qfc: ["QFC", "Quality Food Centers"],
    "pick-n-save": ["Pick ’n Save", "Pick’n Save"],
    "metro-market": ["Metro Market"],
    marianos: ["Mariano’s"],
    "food-4-less": ["Food 4 Less"],
    "foods-co": ["Foods Co"],
    "jay-c": ["Jay C", "Jay C Food Store"],
    "pay-less": ["Pay-Less", "Pay Less Super Markets"],
    "harris-teeter": ["Harris Teeter"],
    albertsons: ["Albertsons", "Albertsons Market"],
    safeway: ["Safeway"],
    vons: ["Vons"],
    pavilions: ["Pavilions"],
    "jewel-osco": ["Jewel-Osco"],
    acme: ["ACME", "ACME Markets"],
    shaws: ["Shaw’s"],
    "star-market": ["Star Market"],
    "tom-thumb": ["Tom Thumb"],
    randalls: ["Randalls"],
    "united-supermarkets": ["United Supermarkets"],
    "market-street": ["Market Street"],
    carrs: ["Carrs", "Carrs Safeway"],
    haggen: ["Haggen", "Haggen Food & Pharmacy"],
    "food-lion": ["Food Lion"],
    hannaford: ["Hannaford", "Hannaford Supermarket"],
    "stop-and-shop": ["Stop & Shop"],
    giant: ["Giant", "Giant Food", "Giant Food Stores"],
    martins: ["Martin’s", "Martin’s Food Markets", "Martin’s Super Markets"],
    publix: ["Publix", "Publix Super Market"],
    heb: ["H-E-B", "HEB", "H-E-B plus!"],
    meijer: ["Meijer", "Meijer Supercenter"],
    wegmans: ["Wegmans", "Wegmans Food Markets"],
    winco: ["WinCo", "WinCo Foods"],
    "hy-vee": ["Hy-Vee"],
    shoprite: ["ShopRite"],
    "giant-eagle": ["Giant Eagle", "Giant Eagle Supermarket", "Giant Eagle Market District", "Market District"],
    "grocery-outlet": ["Grocery Outlet", "Grocery Outlet Bargain Market"],
    "save-a-lot": ["Save A Lot", "Save-A-Lot"],
  },
};
const publicChainIds: Readonly<Record<string, ChainId>> = {
  "CA:loblaws": "ca-loblaws", "CA:no-frills": "ca-no-frills", "CA:walmart": "ca-walmart",
  "US:aldi": "us-aldi", "US:kroger": "us-kroger", "US:walmart": "us-walmart",
};
function normalizeName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’‘ʼ]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function countryBanners(country: Country): Map<string, GroceryBanner> {
  return new Map(Object.entries(banners[country]).flatMap(([id, names]) => names.map(name => [normalizeName(name), {
    id: `${country.toLowerCase()}-${id}`, chainId: publicChainIds[`${country}:${id}`] ?? null,
  }])));
}
const recognized = { CA: countryBanners("CA"), US: countryBanners("US") };

/** Whole banner/known format matches only; arbitrary prefixes and suffixes do not qualify. */
export function matchGroceryBanner(name: string, country: Country): GroceryBanner | null {
  const normalized = normalizeName(name);
  const exact = recognized[country].get(normalized);
  if (exact) return exact;
  // Owner names are common for No Frills. Require the possessive and the complete banner.
  if (country === "CA" && /^[\p{L}][\p{L} &.’'\u2018ʼ-]{0,60}['’\u2018ʼ]s\s+no[\s-]*frills$/iu.test(name.normalize("NFKC").trim())) {
    return recognized.CA.get("no frills")!;
  }
  // These banners use an explicit location suffix in their branch display names.
  if (country === "US" && !/\b(?:pharmacy|fuel|gas|liquor|express)\b/.test(normalized)) {
    if (/^publix super market at [\p{L}\p{N}][\p{L}\p{N} ]{0,100}$/u.test(normalized)) return recognized.US.get("publix")!;
    if (/^shoprite of [\p{L}\p{N}][\p{L}\p{N} ]{0,100}$/u.test(normalized)) return recognized.US.get("shoprite")!;
  }
  return null;
}

/** Preserve all existing public IDs; additional eligible banners keep chainId null. */
export function matchChain(name: string, country: Country): ChainId | null {
  return matchGroceryBanner(name, country)?.chainId ?? null;
}
