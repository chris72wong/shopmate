import "server-only";
import { z } from "zod";
import { locationInputSchema, type Country, type Money } from "@/contracts";
import { invalidRequest, ServiceError } from "@/server/errors";

const locationSchema = z.object({ locationId: z.string().regex(/^\d{1,20}$/), name: z.string(), address: z.object({ addressLine1: z.string(), city: z.string(), state: z.string(), zipCode: z.string() }) });
const productSchema = z.object({ productId: z.string(), upc: z.string().optional(), description: z.string(), brand: z.string().optional(), items: z.array(z.object({
  itemId: z.string(), size: z.string().optional(), price: z.object({ regular: z.number().optional() }).optional(), inventory: z.object({ stockLevel: z.string().optional() }).optional(),
})).optional() });

export interface KrogerObservedProduct {
  productId: string; itemId: string; upc: string | null; description: string; brand: string | null;
  packageLabel: string | null; regularPrice: Money | null; stockLevel: string | null;
  /** Raw retailer package labels have not been mapped to canonical edible/dry/drained content. */
  optimizerReady: false;
}
export interface KrogerProbeResult {
  status: "observed" | "no-locations";
  source: "kroger"; country: "US"; retrievedAt: string;
  location: z.infer<typeof locationSchema> | null; products: KrogerObservedProduct[]; notices: string[];
}
interface ProbeOptions { clientId?: string; clientSecret?: string; fetcher?: typeof fetch; timeoutMs?: number }

/** Read-only credential/access spike. It deliberately does not implement GroceryPricingProvider. */
export async function probeKrogerPricing(input: { country: Country; postalCode: string; term: string }, options: ProbeOptions = {}): Promise<KrogerProbeResult> {
  if (input.country !== "US") invalidRequest("country", "This pricing investigation supports US Kroger locations only.");
  const location = locationInputSchema.safeParse({ country: input.country, postalCode: input.postalCode });
  if (!location.success || !z.string().trim().min(2).max(64).safeParse(input.term).success) invalidRequest("location", "Use a valid US ZIP code and a product search term of 2–64 characters.");
  const clientId = (options.clientId ?? process.env.KROGER_CLIENT_ID)?.trim();
  const secret = (options.clientSecret ?? process.env.KROGER_CLIENT_SECRET)?.trim();
  if (!clientId || !secret) throw new ServiceError(503, { code: "provider-not-configured", message: "The Kroger access probe requires server-side client credentials." });
  const fetcher = options.fetcher ?? fetch;
  const failure = () => new ServiceError(502, { code: "provider-error", message: "The Kroger access probe could not complete. Check provider access and configuration." });
  async function json(url: string | URL, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetcher(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
      if (response.status === 429) throw new ServiceError(429, { code: "rate-limited", message: "The retailer request limit was reached." });
      if (!response.ok) throw failure();
      return await response.json();
    } catch (error) { if (error instanceof ServiceError) throw error; throw failure(); }
  }
  const token = z.object({ access_token: z.string().min(1) }).safeParse(await json("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" }).toString(),
  }));
  if (!token.success) throw failure();
  const headers = { Accept: "application/json", Authorization: `Bearer ${token.data.access_token}` };
  const locationsUrl = new URL("https://api.kroger.com/v1/locations");
  locationsUrl.searchParams.set("filter.zipCode.near", location.data.postalCode.slice(0, 5));
  locationsUrl.searchParams.set("filter.radiusInMiles", "10"); locationsUrl.searchParams.set("filter.limit", "1");
  const locations = z.object({ data: z.array(locationSchema).max(1) }).safeParse(await json(locationsUrl, { headers }));
  if (!locations.success) throw failure();
  const branch = locations.data.data[0];
  const notices = ["These are provider-returned regular-price observations, not an approved or completely mapped optimizer price feed.",
    "No Google-branch identity, canonical usable package quantity, price channel, promotion eligibility, stock guarantee or comparison/display rights have been verified.",
    "No retailer values are written into the illustrative v1 catalog. No Canadian retailer integration is established."];
  if (!branch) return { status: "no-locations", source: "kroger", country: "US", retrievedAt: new Date().toISOString(), location: null, products: [], notices };
  const productsUrl = new URL("https://api.kroger.com/v1/products");
  productsUrl.searchParams.set("filter.locationId", branch.locationId);
  productsUrl.searchParams.set("filter.term", input.term.trim()); productsUrl.searchParams.set("filter.limit", "5");
  const response = z.object({ data: z.array(productSchema).max(5) }).safeParse(await json(productsUrl, { headers }));
  if (!response.success) throw failure();
  return { status: "observed", source: "kroger", country: "US", retrievedAt: new Date().toISOString(), location: branch,
    products: response.data.data.flatMap(product => (product.items ?? []).map(item => {
      const price = item.price?.regular;
      const cents = typeof price === "number" ? Math.round(price * 100) : NaN;
      const regularPrice: Money | null = typeof price === "number" && price > 0 && Number.isSafeInteger(cents) && Math.abs(price * 100 - cents) < 1e-7 ? { amountCents: cents, currency: "USD" } : null;
      return { productId: product.productId, itemId: item.itemId, upc: product.upc ?? null, description: product.description, brand: product.brand ?? null,
        packageLabel: item.size ?? null, regularPrice, stockLevel: item.inventory?.stockLevel ?? null, optimizerReady: false as const };
    })), notices };
}
