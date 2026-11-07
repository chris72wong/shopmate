import type { Country, PricingProfile, PricingProfileId, ProductOffer, ProductPackage } from "@/contracts";
import { ingredientById } from "./ingredients";

/** All names identify pricing fixtures, never a retailer feed or a verified store quote. */
export const pricingProfiles: PricingProfile[] = [
  { id: "ca-loblaws", label: "Loblaws · illustrative", country: "CA", currency: "CAD", chainId: "ca-loblaws", basis: "illustrative" },
  { id: "ca-no-frills", label: "No Frills · illustrative", country: "CA", currency: "CAD", chainId: "ca-no-frills", basis: "illustrative" },
  { id: "ca-walmart", label: "Walmart Canada · illustrative", country: "CA", currency: "CAD", chainId: "ca-walmart", basis: "illustrative" },
  { id: "us-aldi", label: "ALDI · illustrative", country: "US", currency: "USD", chainId: "us-aldi", basis: "illustrative" },
  { id: "us-kroger", label: "Kroger · illustrative", country: "US", currency: "USD", chainId: "us-kroger", basis: "illustrative" },
  { id: "us-walmart", label: "Walmart US · illustrative", country: "US", currency: "USD", chainId: "us-walmart", basis: "illustrative" },
  ...(["CA", "US"] as Country[]).flatMap((country) => ["cedar", "clover", "orchard"].map((name): PricingProfile => ({
    id: `demo-${country.toLowerCase()}-${name}` as PricingProfileId,
    label: `Fictional ${name} market · illustrative`, country,
    currency: country === "CA" ? "CAD" : "USD", chainId: null, basis: "illustrative",
  }))),
];

type PriceRow = [ingredientId: string, quantity: number, label: string,
  cents: [caLoblaws: number, caNoFrills: number, caWalmart: number, usAldi: number, usKroger: number, usWalmart: number]];

/** Hand-authored sample package prices. CAD and USD are independent fixtures, not converted. */
const rows: PriceRow[] = [
  ["oats", 1000, "1 kg certified gluten-free oats", [649, 529, 547, 449, 549, 498]],
  ["milk", 2000, "2 L milk", [499, 469, 477, 279, 329, 298]],
  ["banana", 700, "Bunch · 700 g edible portion", [199, 169, 177, 139, 169, 148]],
  ["yogurt", 750, "750 g plain Greek yogurt", [649, 549, 597, 379, 499, 448]],
  ["chickpeas", 240, "400 g can · 240 g drained", [169, 129, 127, 89, 109, 98]],
  ["rice", 900, "900 g dry brown rice", [429, 349, 367, 249, 329, 298]],
  ["spinach", 142, "142 g baby spinach", [399, 349, 347, 219, 299, 248]],
  ["tomato", 454, "454 g tomatoes", [349, 299, 297, 199, 279, 248]],
  ["cucumber", 300, "1 cucumber · 300 g usable", [179, 149, 147, 79, 99, 88]],
  ["olive-oil", 500, "500 ml olive oil", [899, 749, 797, 599, 749, 698]],
  ["lemon-juice", 250, "250 ml bottled lemon juice", [229, 179, 197, 129, 179, 148]],
  ["lentils", 900, "900 g dry red lentils", [449, 349, 397, 279, 349, 298]],
  ["carrot", 907, "907 g carrots", [299, 249, 247, 159, 199, 178]],
  ["onion", 907, "907 g onions", [329, 249, 277, 189, 249, 218]],
  ["black-beans", 240, "400 g can · 240 g drained", [169, 129, 127, 89, 119, 98]],
  ["corn", 285, "341 ml can · 285 g drained", [189, 149, 147, 89, 109, 98]],
  ["bell-pepper", 450, "3 peppers · 450 g usable", [449, 349, 397, 249, 329, 298]],
  ["tortilla", 8, "8 wheat tortillas", [349, 279, 297, 179, 249, 198]],
  ["pasta", 454, "454 g dry wheat pasta", [199, 149, 147, 99, 129, 118]],
  ["chicken", 600, "600 g raw chicken breast", [1049, 899, 947, 549, 749, 648]],
  ["egg", 12, "12 large eggs", [429, 379, 397, 249, 329, 298]],
  ["tofu", 350, "350 g firm tofu", [349, 279, 297, 179, 249, 218]],
  ["broccoli", 400, "1 crown · 400 g usable", [299, 249, 247, 169, 229, 198]],
  ["peanut-butter", 500, "500 g peanut butter", [449, 349, 397, 229, 299, 268]],
  ["potato", 2268, "2.27 kg potatoes", [549, 449, 477, 299, 399, 348]],
  ["cheddar", 400, "400 g cheddar", [649, 499, 547, 349, 449, 398]],
  ["quinoa", 400, "400 g dry quinoa", [549, 449, 477, 299, 399, 348]],
  ["canned-tomatoes", 796, "796 g can diced tomatoes", [249, 199, 197, 149, 199, 178]],
  ["garlic", 60, "1 bulb · 60 g usable", [99, 79, 77, 49, 69, 58]],
  ["soy-sauce", 450, "450 ml soy sauce (contains wheat)", [349, 279, 297, 179, 249, 218]],
  ["pumpkin-seeds", 200, "200 g pumpkin seeds", [449, 349, 397, 249, 349, 298]],
];

export const products: ProductPackage[] = rows.map(([ingredientId, quantity, label]) => {
  const ingredient = ingredientById[ingredientId];
  if (!ingredient) throw new Error(`Unknown package ingredient ${ingredientId}.`);
  return { id: `pkg-${ingredientId}`, ingredientId, name: ingredient.name, label,
    content: { quantity, unit: ingredient.unit }, countries: ["CA", "US"] };
});

const priceColumns: Record<PricingProfileId, number> = {
  "ca-loblaws": 0, "ca-no-frills": 1, "ca-walmart": 2,
  "us-aldi": 3, "us-kroger": 4, "us-walmart": 5,
  "demo-ca-cedar": 0, "demo-ca-clover": 1, "demo-ca-orchard": 2,
  "demo-us-cedar": 3, "demo-us-clover": 4, "demo-us-orchard": 5,
};

export const offers: ProductOffer[] = pricingProfiles.flatMap((profile) => rows.map(([id, , , prices]) => ({
  productId: `pkg-${id}`, profileId: profile.id,
  price: { amountCents: prices[priceColumns[profile.id]]!, currency: profile.currency },
  basis: "illustrative" as const, available: true,
})));
