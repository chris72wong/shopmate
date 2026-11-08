import "server-only";
import { decimalMoney, safeProductUrl } from "@/server/pricing/normalize";
import { retailFailure } from "@/server/pricing/retail-http";
import type { Money } from "@/contracts";

export interface AdvertisedDeal {
  id: string; title: string; retailer: string | null; price: Money | null; regularPrice: Money | null;
  observedAt: string; validTo: null; sourceUrl: string; attribution: string;
  scope: "region"; providerStoreId: null; availability: "unknown"; optimizerEligible: false;
}
export interface BidouDeals { country: "CA"; province: "ON" | "QC"; basis: "advertised"; retrievedAt: string; deals: AdvertisedDeal[]; notices: string[] }
function xmlText(value: string): string {
  const content = value.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return content.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()]!;
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  }).replace(/<[^>]*>/g, "").trim();
}
/** Bounded RSS 2.0 item reader. No DTD/entities, HTML execution, external references or catalogue scraping. */
export function parseBidouDeals(xml: string, province: "ON" | "QC", retrievedAt: string): BidouDeals {
  if (xml.length > 262_144 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/.test(xml) || !/<channel>/.test(xml)) throw retailFailure();
  const deals: AdvertisedDeal[] = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (deals.length >= 50) break;
    const field = (tag: string) => xmlText(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`).exec(item[1]!)?.[1] ?? "");
    const title = field("title"); const sourceUrl = safeProductUrl(field("link")); const id = field("guid"); const observed = Date.parse(field("pubDate"));
    if (!title || title.length > 1000 || !id || id.length > 500 || !Number.isFinite(observed) || !sourceUrl || new URL(sourceUrl).hostname !== "bidou.store" || deals.some(deal => deal.id === id)) continue;
    const amount = /\$([\d]+(?:\.\d{1,2})?)\s+at\s+(.+?)(?:\s[—–]|$)/.exec(title);
    const regular = /\(reg\.\s*\$([\d]+(?:\.\d{1,2})?)\)/.exec(field("description"));
    const observedAt = new Date(observed).toISOString();
    deals.push({ id, title, retailer: amount?.[2]?.trim() ?? null, price: decimalMoney(amount?.[1], "CAD"), regularPrice: decimalMoney(regular?.[1], "CAD"),
      observedAt, validTo: null, sourceUrl, attribution: `Source: Bidou · price observed ${observedAt.slice(0, 10)}`, scope: "region", providerStoreId: null, availability: "unknown", optimizerEligible: false });
  }
  return { country: "CA", province, basis: "advertised", retrievedAt, deals, notices: ["Public Bidou advertised deals for the province, with source and observation dates. These are not verified prices at a selected physical branch.",
    "Promotion expiry, conditions and current stock are unknown. These deals never enter the optimizer. Check the linked offer before shopping."] };
}
export function createBidouDealsReader(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { expires: number; data: BidouDeals }>();
  const pending = new Map<string, Promise<BidouDeals>>();
  return async (province: "ON" | "QC"): Promise<BidouDeals> => {
    const hit = cache.get(province); if (hit && hit.expires > now()) return structuredClone(hit.data);
    if (pending.has(province)) return structuredClone(await pending.get(province)!);
    const operation = (async () => {
      try {
        const response = await fetcher(`https://bidou.store/flux/rabais-${province.toLowerCase()}-en.xml`, { headers: { "User-Agent": "ShopMate/0.1 (dated regional deal reader)" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
        if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 262_144) throw retailFailure();
        const data = parseBidouDeals(await response.text(), province, new Date(now()).toISOString());
        cache.set(province, { expires: now() + 300_000, data }); return data;
      } catch { throw retailFailure(); }
    })();
    pending.set(province, operation);
    try { return structuredClone(await operation); } finally { pending.delete(province); }
  };
}
export const readBidouDeals = createBidouDealsReader();
