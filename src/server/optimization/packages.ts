import type { BasketLine, Currency, Money, ProductPackage, Quantity } from "@/contracts";

export interface PricedPackage { product: ProductPackage; price: Money }
export class PackageSearchLimitError extends Error {}
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
  // Metric/US package combinations can have a tiny GCD. Enumerate package counts instead of
  // allocating millions of fractional-unit states, without rounding away usable content.
  if (bound > 200_000) {
    const requiredSize = Math.round(required.quantity * precision);
    let bestCost = Infinity; let bestCount = Infinity; let bestSize = Infinity;
    let bestCounts: number[] = [];
    const chosen = new Array<number>(options.length).fill(0);
    let visits = 0;
    const consider = (cost: number, count: number, amount: number) => {
      if (cost < bestCost || (cost === bestCost && (count < bestCount || (count === bestCount && amount < bestSize)))) {
        bestCost = cost; bestCount = count; bestSize = amount; bestCounts = [...chosen];
      }
    };
    options.forEach((item, index) => {
      const count = Math.ceil(requiredSize / sizes[index]!);
      chosen[index] = count; consider(count * item.price.amountCents, count, count * sizes[index]!); chosen[index] = 0;
    });
    const minimumUnitCost = Math.min(...options.map((item, index) => item.price.amountCents / sizes[index]!));
    function visit(index: number, amount: number, cost: number, count: number): void {
      if (++visits > 100_000) throw new PackageSearchLimitError("The exact package-count search limit was reached.");
      if (amount >= requiredSize) { consider(cost, count, amount); return; }
      if (index >= options.length || cost > bestCost || cost + (requiredSize - amount) * minimumUnitCost > bestCost + 1e-7) return;
      const size = sizes[index]!; const price = options[index]!.price.amountCents;
      const maxCount = Math.min(Math.ceil((requiredSize - amount) / size), Math.floor((bestCost - cost) / price));
      const minCount = index === options.length - 1 ? Math.ceil((requiredSize - amount) / size) : 0;
      for (let purchased = minCount; purchased <= maxCount; purchased++) {
        chosen[index] = purchased;
        visit(index + 1, amount + purchased * size, cost + purchased * price, count + purchased);
      }
      chosen[index] = 0;
    }
    visit(0, 0, 0, 0);
    let remaining = required.quantity;
    return options.flatMap((item, index) => {
      const count = bestCounts[index]!;
      if (!count) return [];
      const allocated = quantityValue(Math.min(remaining, item.product.content.quantity * count));
      remaining = quantityValue(remaining - allocated);
      return [makeLine(item, count, allocated)];
    });
  }
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
