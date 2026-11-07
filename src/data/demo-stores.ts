import type { Country, DemoStore, PricingProfileId } from "@/contracts";

export function getDemoStores(country: Country): DemoStore[] {
  return [
    { slug: "cedar", name: "Cedar Market", address: "12 Cedar Lane · fictional address" },
    { slug: "clover", name: "Clover Grocer", address: "48 Clover Street · fictional address" },
    { slug: "orchard", name: "Orchard Pantry", address: "7 Orchard Way · fictional address" },
  ].map((entry) => ({
    id: `demo-${country.toLowerCase()}-${entry.slug}`,
    name: entry.name, address: entry.address, country, chainId: null,
    source: "demo", googlePlaceId: null, coordinates: null, distanceMeters: null, googleMapsUri: null,
    pricing: { status: "illustrative", profileId: `demo-${country.toLowerCase()}-${entry.slug}` as PricingProfileId },
  }));
}
