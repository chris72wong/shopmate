import type { Country, Currency, Money, Quantity, RetailProductObservation } from "@/contracts";

export function decimalMoney(value: unknown, currency: Currency): Money | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [dollars = "0", fraction = ""] = text.split(".");
  const amountCents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return amountCents > 0 && Number.isSafeInteger(amountCents) ? { amountCents, currency } : null;
}
export function canonicalName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[®™]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
/** GS1 check digit validation; Kroger's internal 13-digit IDs must never be padded into invented GTINs. */
export function normalizeGtin(value: string | null | undefined): string | null {
  if (!value || !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return null;
  const digits = [...value].map(Number); const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check ? value.padStart(14, "0") : null;
}
/** Only unambiguous fixed package labels. No density, drained-weight or variable-weight inference. */
export function parsePackage(label: string | null, country?: Country): Quantity | null {
  if (!label || label.length > 100) return null;
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  const match = /^(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l|fl\s*oz|oz|onz|lb|gal|qt|pt|ct|count|each|ea)$/.exec(normalized);
  if (!match) return null;
  const count = match[1] ? Number(match[1]) : 1;
  const amount = Number(match[2]) * count;
  const units: Record<string, { unit: Quantity["unit"]; factor: number }> = {
    kg: { unit: "g", factor: 1000 }, g: { unit: "g", factor: 1 }, mg: { unit: "g", factor: .001 },
    l: { unit: "ml", factor: 1000 }, ml: { unit: "ml", factor: 1 }, "fl oz": { unit: "ml", factor: 29.5735295625 },
    gal: { unit: "ml", factor: 3785.411784 }, qt: { unit: "ml", factor: 946.352946 }, pt: { unit: "ml", factor: 473.176473 },
    oz: { unit: "g", factor: 28.349523125 }, onz: { unit: "g", factor: 28.349523125 }, lb: { unit: "g", factor: 453.59237 },
    ct: { unit: "each", factor: 1 }, count: { unit: "each", factor: 1 }, each: { unit: "each", factor: 1 }, ea: { unit: "each", factor: 1 },
  };
  const conversion = units[match[3]!.replace(/\s+/g, " ")];
  if (!conversion || (['gal', 'qt', 'pt', 'fl oz'].includes(match[3]!.replace(/\s+/g, " ")) && country !== "US") || amount <= 0 || !Number.isFinite(amount) || (conversion.unit === "each" && !Number.isInteger(amount))) return null;
  return { quantity: Math.round(amount * conversion.factor * 1_000_000) / 1_000_000, unit: conversion.unit };
}
export function safeProductUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && ![...url.searchParams.keys()].some(key => /key|token|secret/i.test(key)) ? url.href : null; } catch { return null; }
}
export function eligiblePrice(observation: RetailProductObservation, now: number): { price: Money; type: "regular" | "unconditional-sale"; expiresAt: string } | null {
  if (observation.scope !== "branch" || observation.availability !== "available" || observation.priceIsEstimate
    || !Number.isFinite(Date.parse(observation.retrievedAt)) || Date.parse(observation.retrievedAt) > now + 60_000
    || (observation.sourceObservedAt !== null && (!Number.isFinite(Date.parse(observation.sourceObservedAt)) || Date.parse(observation.sourceObservedAt) > now + 60_000))
    || !Number.isFinite(Date.parse(observation.expiresAt)) || Date.parse(observation.expiresAt) <= now) return null;
  let winner = observation.regularPriceIsCurrent ? observation.regularPrice : null;
  let expiresAt = observation.expiresAt;
  let type: "regular" | "unconditional-sale" = "regular";
  for (const promotion of observation.promotions) {
    if (promotion.price.currency !== (observation.country === "CA" ? "CAD" : "USD") || !Number.isSafeInteger(promotion.price.amountCents) || promotion.price.amountCents <= 0) continue;
    if (promotion.type !== "unconditional-sale" || promotion.membershipRequired || promotion.couponRequired || (promotion.minimumQuantity !== null && promotion.minimumQuantity !== 1)
      || !promotion.validTo || !Number.isFinite(Date.parse(promotion.validTo)) || Date.parse(promotion.validTo) <= now
      || (promotion.validFrom !== null && (!Number.isFinite(Date.parse(promotion.validFrom)) || Date.parse(promotion.validFrom) > now))) continue;
    if (!winner || promotion.price.amountCents < winner.amountCents) {
      winner = promotion.price; type = "unconditional-sale";
      expiresAt = new Date(Math.min(Date.parse(observation.expiresAt), Date.parse(promotion.validTo))).toISOString();
    }
  }
  return winner && Number.isSafeInteger(winner.amountCents) && winner.amountCents > 0 ? { price: winner, type, expiresAt } : null;
}
