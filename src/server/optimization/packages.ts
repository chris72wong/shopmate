import type { BasketLine, Currency, Money, ProductPackage, Quantity } from "@/contracts";

export interface PricedPackage { product: ProductPackage; price: Money }
const precision = 1_000_000;
export const quantityValue = (value: number): number => Math.round(value * precision) / precision;
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

/** Exact unbounded covering knapsack in integer canonical units, not prorated ingredient cost. */
export function purchasePackages(ingredientId: string, required: Quantity, packages: readonly PricedPackage[], currency: Currency): BasketLine[] | null {
  if (!Number.isFinite(required.quantity) || required.quantity <= 0) throw new Error("Invalid ingredient requirement.");
  const options = packages.filter(item => item.product.ingredientId === ingredientId && item.product.content.unit === required.unit
    && Number.isFinite(item.product.content.quantity) && item.product.content.quantity > 0 && item.price.currency === currency
    && Number.isSafeInteger(item.price.amountCents) && item.price.amountCents > 0).sort((a, b) => a.product.id.localeCompare(b.product.id, "en"));
  if (!options.length) return null;
  if (options.some(item => Math.round(item.product.content.quantity * precision) < 1)) throw new Error("Unsupported package precision.");
  const makeLine = (item: PricedPackage, count: number, allocated: number): BasketLine => {
    const purchased = quantityValue(item.product.content.quantity * count);
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(count * item.price.amountCents)) throw new Error("Package purchase exceeds safe arithmetic limits.");
    return { ingredientId, productId: item.product.id, required: { quantity: allocated, unit: required.unit }, packageCount: count,
      purchased: { quantity: purchased, unit: required.unit }, leftover: { quantity: quantityValue(purchased - allocated), unit: required.unit },
      unitPrice: { ...item.price }, subtotal: { amountCents: count * item.price.amountCents, currency } };
  };
  if (options.length === 1) {
    const item = options[0]!;
    const count = Math.ceil(Math.round(required.quantity * precision) / Math.round(item.product.content.quantity * precision));
    return [makeLine(item, count, required.quantity)];
  }
  const sizes = options.map(item => Math.round(item.product.content.quantity * precision));
  if (sizes.some(size => size <= 0 || !Number.isSafeInteger(size))) throw new Error("Unsupported package precision.");
  const divisor = sizes.reduce(gcd);
  const units = sizes.map(size => size / divisor);
  const target = Math.ceil(Math.round(required.quantity * precision) / divisor);
  const bound = target + Math.max(...units) - 1;
  // Reject unsupported catalog mappings rather than silently truncate package search and claim optimality.
  if (bound > 200_000) throw new Error("Package mapping needs a coarser canonical precision.");
  const costs = new Float64Array(bound + 1).fill(Infinity);
  const counts = new Float64Array(bound + 1).fill(Infinity);
  const previous = new Int32Array(bound + 1).fill(-1);
  costs[0] = 0; counts[0] = 0;
  for (let amount = 0; amount <= bound; amount++) {
    if (!Number.isFinite(costs[amount])) continue;
    for (let index = 0; index < options.length; index++) {
      const next = amount + units[index]!;
      if (next > bound) continue;
      const cost = costs[amount]! + options[index]!.price.amountCents;
      const count = counts[amount]! + 1;
      if (cost < costs[next]! || (cost === costs[next] && count < counts[next]!)) {
        costs[next] = cost; counts[next] = count; previous[next] = index;
      }
    }
  }
  let best = target;
  for (let amount = target + 1; amount <= bound; amount++) {
    if (costs[amount]! < costs[best]! || (costs[amount] === costs[best] && counts[amount]! < counts[best]!)) best = amount;
  }
  if (!Number.isFinite(costs[best])) return null;
  const packageCounts = new Array<number>(options.length).fill(0);
  for (let amount = best; amount > 0;) {
    const index = previous[amount]!;
    if (index < 0) throw new Error("Invalid package search reconstruction.");
    packageCounts[index] = packageCounts[index]! + 1; amount -= units[index]!;
  }
  let remaining = required.quantity;
  return options.flatMap((item, index) => {
    const count = packageCounts[index]!;
    if (!count) return [];
    const allocated = quantityValue(Math.min(remaining, item.product.content.quantity * count));
    remaining = quantityValue(remaining - allocated);
    return [makeLine(item, count, allocated)];
  });
}
