import type { Ingredient, RetailProductObservation, VerifiedOffer } from "@/contracts";
import type { BranchBinding, ProductMapping } from "@/server/pricing/retail-config";
import { canonicalName, eligiblePrice, normalizeGtin } from "@/server/pricing/normalize";

export function matchVerifiedOffer(observation: RetailProductObservation, mapping: ProductMapping, binding: BranchBinding, ingredient: Ingredient, now: number): VerifiedOffer | null {
  if (observation.providerId !== mapping.providerId || observation.providerId !== binding.providerId || observation.retailer !== mapping.retailer || observation.retailer !== binding.retailer
    || observation.country !== binding.country || observation.providerStoreId !== binding.providerStoreId || observation.channel !== binding.channel || ingredient.id !== mapping.ingredientId
    || ingredient.unit !== mapping.usableQuantity.unit || !observation.packageQuantity || !observation.brand) return null;
  if (mapping.productId && observation.productId !== mapping.productId) return null;
  if (mapping.gtin && (!normalizeGtin(mapping.gtin) || normalizeGtin(mapping.gtin) !== observation.gtin)) return null;
  // ID matches still check the reviewed product metadata, detecting changed sizes/formulations.
  if (canonicalName(observation.name) !== canonicalName(mapping.expectedName) || canonicalName(observation.brand) !== canonicalName(mapping.expectedBrand)
    || observation.packageQuantity.unit !== mapping.netQuantity.unit || Math.abs(observation.packageQuantity.quantity - mapping.netQuantity.quantity) > .000001) return null;
  const preparation = ingredient.name.includes("(dry)") ? "dry" : ingredient.name.includes("drained") ? "drained" : ingredient.name.includes("edible") ? "edible" : ingredient.name.includes("(raw)") ? "raw" : null;
  if (preparation && mapping.preparation !== preparation) return null;
  if (mapping.netQuantity.unit !== mapping.usableQuantity.unit && mapping.preparation !== "drained") return null;
  const selected = eligiblePrice(observation, now);
  if (!selected || selected.price.currency !== (binding.country === "CA" ? "CAD" : "USD")) return null;
  return { basis: "verified", available: true, price: selected.price, observation,
    product: { id: `retail:${binding.providerId}:${binding.providerStoreId}:${observation.productId}`, ingredientId: ingredient.id, name: observation.name,
      label: observation.packageLabel ?? `${mapping.netQuantity.quantity} ${mapping.netQuantity.unit}`, content: mapping.usableQuantity, countries: [binding.country] },
    provenance: { providerId: binding.providerId, providerStoreId: binding.providerStoreId, providerProductId: observation.productId, channel: binding.channel, priceType: selected.type,
      retrievedAt: observation.retrievedAt, providerUpdatedAt: observation.providerUpdatedAt, expiresAt: selected.expiresAt, sourceUrl: observation.sourceUrl } };
}
