import "server-only";
import { ServiceError } from "@/server/errors";

export interface RetailHttpOptions { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; pause?: (ms: number) => Promise<void> }
export const retailUnavailable = () => new ServiceError(503, { code: "provider-not-configured", message: "This retailer’s pricing credentials or access are not configured." });
export const retailFailure = () => new ServiceError(502, { code: "provider-error", message: "The retailer price request could not be verified. Please try again." });
export class RetailHttp {
  private cache = new Map<string, { value: unknown; until: number }>();
  private inFlight = new Map<string, Promise<unknown>>();
  private observations = new Map<string, string>();
  private minute = 0; private minuteCalls = 0; private day = 0; private dayCalls = 0; private active = 0;
  private readonly now: () => number;
  constructor(private options: RetailHttpOptions = {}) { this.now = options.now ?? Date.now; }
  observedAt(key: string): string { return this.observations.get(key) ?? new Date(this.now()).toISOString(); }
  async json(key: string, url: string, init: RequestInit, ttlMs = 0): Promise<unknown> {
    const entry = this.cache.get(key);
    if (entry && entry.until > this.now()) return structuredClone(entry.value);
    if (this.inFlight.has(key)) return structuredClone(await this.inFlight.get(key)!);
    const operation = this.fetchJson(url, init).then(value => {
      if (this.observations.size >= 200) this.observations.delete(this.observations.keys().next().value!);
      this.observations.set(key, new Date(this.now()).toISOString());
      if (ttlMs > 0) { if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!); this.cache.set(key, { value, until: this.now() + Math.min(ttlMs, 300_000) }); }
      return value;
    });
    this.inFlight.set(key, operation);
    try { return structuredClone(await operation); } finally { this.inFlight.delete(key); }
  }
  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = this.now();
      if (now - this.minute >= 60_000) { this.minute = now; this.minuteCalls = 0; }
      if (now - this.day >= 86_400_000) { this.day = now; this.dayCalls = 0; }
      if (this.minuteCalls >= 60 || this.dayCalls >= 500 || this.active >= 4) throw new ServiceError(429, { code: "rate-limited", message: "The retail pricing usage limit was reached. Please try again later." });
      this.minuteCalls++; this.dayCalls++; this.active++;
      let retry = false;
      try {
        const response = await (this.options.fetcher ?? fetch)(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000) });
        if (response.status === 401 || response.status === 403) throw retailUnavailable();
        if (response.status === 429) throw new ServiceError(429, { code: "rate-limited", message: "The retailer request limit was reached. Please wait before retrying." });
        if (response.status === 404) return null;
        if (!response.ok) { if ([502, 503, 504].includes(response.status) && attempt === 0) retry = true; else throw retailFailure(); }
        else {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && (("ok" in body && body.ok === false) || ("success" in body && body.success === false))) throw retailFailure();
          return body;
        }
      } catch (error) { if (error instanceof ServiceError) throw error; if (attempt === 0) retry = true; else throw retailFailure(); }
      finally { this.active--; }
      if (retry) await (this.options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(150);
    }
    throw retailFailure();
  }
}
