import { describe, expect, it } from "vitest";
import { locationInputSchema, optimizationRequestSchema, storeDiscoveryRequestSchema } from "@/contracts";
import { optimizationRequest } from "./fixtures";

describe("location contract", () => {
  it.each(["m5v2t6", " M5V 2T6 "])("normalizes Canadian input %s", (postalCode) => {
    expect(locationInputSchema.parse({ country: "CA", postalCode })).toEqual({ country: "CA", postalCode: "M5V 2T6" });
  });
  it.each(["02108", "14201-1234"])("preserves US ZIP %s", (postalCode) => {
    expect(locationInputSchema.parse({ country: "US", postalCode }).postalCode).toBe(postalCode);
  });
  it.each([
    ["CA", "D1A 1A1"], ["CA", "W1A 1A1"], ["CA", "K1D 1A1"], ["CA", "14201"],
    ["US", "1420"], ["US", "142011234"], ["US", "M5V 2T6"], ["US", ""], ["GB", "SW1A 1AA"],
  ])("rejects country %s and postal code %s", (country, postalCode) => {
    expect(locationInputSchema.safeParse({ country, postalCode }).success).toBe(false);
  });
  it("requires explicit mode and defaults radius only", () => {
    const input = { location: { country: "CA", postalCode: "M5V2T6" } };
    expect(storeDiscoveryRequestSchema.safeParse(input).success).toBe(false);
    expect(storeDiscoveryRequestSchema.parse({ ...input, mode: "demo" }).radiusKm).toBe(5);
  });
  it.each([0, 51, "5"])("rejects unsupported radius %s", (radiusKm) => {
    expect(storeDiscoveryRequestSchema.safeParse({ mode: "demo", location: { country: "US", postalCode: "14201" }, radiusKm }).success).toBe(false);
  });
});

describe("optimization boundary", () => {
  it("accepts the documented sample request", () => {
    expect(optimizationRequestSchema.parse(optimizationRequest())).toEqual(optimizationRequest());
  });
  it("rejects mixing currencies", () => {
    const input = optimizationRequest(); input.preferences.weeklyBudget.currency = "USD";
    expect(optimizationRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each([0, -100, 100.5, 1_000_001])("rejects invalid budget cents %s", (amountCents) => {
    const input = optimizationRequest(); input.preferences.weeklyBudget.amountCents = amountCents;
    expect(optimizationRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each([[], ["demo-ca-clover", "demo-ca-clover"], ["demo-us-clover"], ["google:abc"],
    ["demo-ca-a", "demo-ca-b", "demo-ca-c", "demo-ca-d"]].map((storeIds) => ({ storeIds })))
  ("rejects invalid selected stores $storeIds", ({ storeIds }) => {
    expect(optimizationRequestSchema.safeParse({ ...optimizationRequest(), storeIds }).success).toBe(false);
  });
  it("rejects out-of-range meal counts and servings", () => {
    const input = optimizationRequest(); input.preferences.mealCount = 15;
    expect(optimizationRequestSchema.safeParse(input).success).toBe(false);
    input.preferences.mealCount = 5; input.preferences.servingsPerMeal = 0;
    expect(optimizationRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects unknown fields, including client-supplied price data", () => {
    expect(optimizationRequestSchema.safeParse({ ...optimizationRequest(), prices: [1] }).success).toBe(false);
    const input = optimizationRequest();
    expect(optimizationRequestSchema.safeParse({ ...input, preferences: { ...input.preferences, magic: true } }).success).toBe(false);
  });
  it("rejects duplicate dietary restrictions and invalid allergen labels", () => {
    const input = optimizationRequest(); input.preferences.dietaryRestrictions = ["vegan", "vegan"];
    expect(optimizationRequestSchema.safeParse(input).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...optimizationRequest(), preferences: {
      ...optimizationRequest().preferences, excludedAllergens: ["unknown"],
    } }).success).toBe(false);
  });
});
