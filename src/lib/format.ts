import type { Money } from "@/contracts";

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat(money.currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency", currency: money.currency, currencyDisplay: "code",
  }).format(money.amountCents / 100);
}
