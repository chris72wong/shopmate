import { describe, expect, it } from "vitest";
import { ingredients } from "@/data/ingredients";
import type { RetailProductObservation } from "@/contracts";
import { canonicalName, decimalMoney, eligiblePrice, normalizeGtin, parsePackage } from "@/server/pricing/normalize";
import { matchVerifiedOffer } from "@/server/pricing/matching";
import { branchBindingSchema, productMappingSchema, bindingForStore, type BranchBinding, type ProductMapping } from "@/server/pricing/retail-config";

const now = Date.parse("2026-11-07T12:00:00Z");
export const binding: BranchBinding = { googlePlaceId: "synthetic", providerId: "reef-loblaws", retailer: "No Frills", country: "CA", providerStoreId: "1234", channel: "pickup", banner: "nofrills", address: { line1: "1 Synthetic Street", city: "Test City", region: "ON", postalCode: "M5V 2T6" } };
export const mapping: ProductMapping = { providerId: "reef-loblaws", retailer: "No Frills", ingredientId: "rice", productId: "test-rice", expectedName: "Long Grain Brown Rice", expectedBrand: "Test Brand", netQuantity: { quantity: 900, unit: "g" }, usableQuantity: { quantity: 900, unit: "g" }, preparation: "dry", contentEvidenceUrl: "https://example.org/synthetic-package" };
export function observation(patch: Partial<RetailProductObservation> = {}): RetailProductObservation {
  return { providerId: "reef-loblaws", retailer: "No Frills", country: "CA", providerStoreId: "1234", productId: "test-rice", gtin: null, name: "Long Grain Brown Rice", brand: "Test Brand", category: "Rice",
    packageLabel: "900 g", packageQuantity: { quantity: 900, unit: "g" }, regularPrice: { amountCents: 550, currency: "CAD" }, regularPriceIsCurrent: true, promotionalPrice: null, promotions: [], unitPrice: { price: { amountCents: 550, currency: "CAD" }, per: { quantity: 900, unit: "g" } }, availability: "available", channel: "pickup", scope: "branch", priceIsEstimate: false,
    retrievedAt: new Date(now).toISOString(), sourceObservedAt: null, providerUpdatedAt: null, expiresAt: new Date(now + 300_000).toISOString(), sourceUrl: "https://example.org/synthetic-product", ...patch };
}
describe("currency and package normalization", () => {
  it.each([[1.99, 199], ["0.01", 1], ["5.5", 550], ["123.45", 12345]] as const)("normalizes %s into integer cents", (value, cents) => { expect(decimalMoney(value, "CAD")).toEqual({ amountCents: cents, currency: "CAD" }); });
  it.each([null, undefined, NaN, Infinity, -1, 0, 1.999, "$5.00", "1,000", "1e2"])("rejects invalid price %s", value => expect(decimalMoney(value, "USD")).toBeNull());
  it.each([["1 kg", 1000, "g"], ["0.5 l", 500, "ml"], ["2 x 250 ml", 500, "ml"], ["12 ct", 12, "each"], ["1 lb", 453.59237, "g"], ["1 oz", 28.349523, "g"], ["1 gal", 3785.411784, "ml"], ["1 fl oz", 29.57353, "ml"]] as const)("converts %s within its measurement dimension", (text, quantity, unit) => expect(parsePackage(text, "US")).toEqual({ quantity, unit }));
  it.each(["about 1 kg", "2 ct / 10 oz", "1 bunch", "each / lb", "1.5 each", "400 g (240 g drained)"])("rejects ambiguous package %s", text => expect(parsePackage(text, "US")).toBeNull());
  it("never treats Canadian fluid ounces or gallons as US volume without evidence", () => { expect(parsePackage("1 gal", "CA")).toBeNull(); expect(parsePackage("1 fl oz")).toBeNull(); expect(parsePackage("500 ml", "CA")?.unit).toBe("ml"); });
  it("checks GTIN digits instead of inventing a barcode from a provider product ID", () => { expect(normalizeGtin("036000291452")).toBe("00036000291452"); expect(normalizeGtin("036000291453")).toBeNull(); expect(normalizeGtin("not-a-gtin")).toBeNull(); });
});
describe("reviewed identity matching and promotions", () => {
  const rice = ingredients.find(item => item.id === "rice")!;
  it("accepts a reviewed exact SKU with full provenance and namespaced package identity", () => {
    const offer = matchVerifiedOffer(observation(), mapping, binding, rice, now);
    expect(offer).toMatchObject({ basis: "verified", price: { amountCents: 550, currency: "CAD" }, product: { id: "retail:reef-loblaws:1234:test-rice", ingredientId: "rice", content: { quantity: 900, unit: "g" } }, provenance: { providerStoreId: "1234", channel: "pickup", priceType: "regular" } });
  });
  it.each([
    { name: "Brown rice cereal" }, { brand: "Different brand" }, { productId: "other-sku" }, { providerStoreId: "wrong-branch" },
    { scope: "region" as const }, { country: "US" as const }, { availability: "unknown" as const }, { availability: "unavailable" as const }, { channel: "delivery" as const },
    { packageQuantity: { quantity: 800, unit: "g" as const } }, { packageQuantity: { quantity: 900, unit: "ml" as const } },
    { expiresAt: new Date(now).toISOString() }, { priceIsEstimate: true }, { regularPrice: { amountCents: 100, currency: "USD" as const } },
  ])("rejects changed, partial, regional or mismatched observations %j", patch => expect(matchVerifiedOffer(observation(patch), mapping, binding, rice, now)).toBeNull());
  it("requires exact normalized name, brand and size even when falling back without an ID", () => {
    const { productId: _id, ...nameMapping } = mapping; void _id;
    expect(matchVerifiedOffer(observation({ productId: "alternative-exact-product" }), nameMapping, binding, rice, now)).not.toBeNull();
    expect(matchVerifiedOffer(observation({ name: "Instant Whole Grain Brown Rice" }), nameMapping, binding, rice, now)).toBeNull();
    expect(canonicalName("Kroger® Brown Rice")).toBe("kroger brown rice");
  });
  it("preserves dry/drained/edible semantics instead of assuming all net package contents are usable", () => {
    expect(matchVerifiedOffer(observation(), { ...mapping, preparation: "as-sold" }, binding, rice, now)).toBeNull();
    const chickpeas = ingredients.find(item => item.id === "chickpeas")!;
    const source = observation({ packageLabel: "400 g", packageQuantity: { quantity: 400, unit: "g" } });
    const reviewed = { ...mapping, ingredientId: "chickpeas", netQuantity: { quantity: 400, unit: "g" as const }, usableQuantity: { quantity: 240, unit: "g" as const }, preparation: "drained" as const };
    expect(matchVerifiedOffer(source, reviewed, binding, chickpeas, now)?.product.content.quantity).toBe(240);
  });
  it("uses a current unconditional sale and bounds freshness by the promotion expiry", () => {
    const end = new Date(now + 30_000).toISOString();
    const source = observation({ promotions: [{ type: "unconditional-sale", price: { amountCents: 450, currency: "CAD" }, validFrom: null, validTo: end, minimumQuantity: 1, membershipRequired: false, couponRequired: false, conditions: "Sale" }] });
    expect(eligiblePrice(source, now)).toEqual({ price: { amountCents: 450, currency: "CAD" }, type: "unconditional-sale", expiresAt: end });
  });
  it.each(["loyalty", "multi-buy", "coupon", "unknown"] as const)("never assumes eligibility for a %s promotion", type => {
    const source = observation({ promotionalPrice: { amountCents: 100, currency: "CAD" }, promotions: [{ type, price: { amountCents: 100, currency: "CAD" }, validFrom: null, validTo: new Date(now + 1000).toISOString(), minimumQuantity: 2, membershipRequired: type === "loyalty", couponRequired: type === "coupon", conditions: "Conditional" }] });
    expect(eligiblePrice(source, now)?.price.amountCents).toBe(550);
  });
  it("rejects unknown-expiry, future and expired promotions without losing the regular price", () => {
    for (const dates of [{ validFrom: null, validTo: null }, { validFrom: null, validTo: new Date(now).toISOString() }, { validFrom: new Date(now + 1000).toISOString(), validTo: new Date(now + 2000).toISOString() }]) {
      const source = observation({ promotions: [{ type: "unconditional-sale", price: { amountCents: 100, currency: "CAD" }, minimumQuantity: 1, membershipRequired: false, couponRequired: false, conditions: null, ...dates }] });
      expect(eligiblePrice(source, now)?.price.amountCents).toBe(550);
    }
  });
  it("validates configuration and requires both explicit Google ID and matching physical address", () => {
    expect(branchBindingSchema.safeParse(binding).success).toBe(true); expect(productMappingSchema.safeParse(mapping).success).toBe(true);
    expect(branchBindingSchema.safeParse({ ...binding, country: "US" }).success).toBe(false);
    expect(productMappingSchema.safeParse({ ...mapping, usableQuantity: { quantity: 1000, unit: "g" } }).success).toBe(false);
    const store = { id: "google:synthetic", name: "No Frills", address: "1 Synthetic Street, Test City, ON M5V 2T6", source: "google" as const, country: "CA" as const, chainId: null, pricing: { status: "unavailable" as const, profileId: null } };
    expect(bindingForStore(store, { bindings: [binding], mappings: [] })).toEqual(binding);
    expect(bindingForStore({ ...store, name: "Loblaws" }, { bindings: [binding], mappings: [] })).toBeUndefined();
    expect(bindingForStore({ ...store, address: "99 Different Street, Other City, M5V 2T6" }, { bindings: [binding], mappings: [] })).toBeUndefined();
    expect(bindingForStore({ ...store, address: "11 Synthetic Street, Test City, ON M5V 2T6" }, { bindings: [binding], mappings: [] })).toBeUndefined();
  });
});
