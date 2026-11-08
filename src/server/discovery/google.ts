import "server-only";
import { z } from "zod";
import { currencyForCountry, storeDiscoveryRequestSchema, type Attribution, type Coordinates, type Country, type GoogleStore } from "@/contracts";
import { ServiceError, invalidRequest } from "@/server/errors";
import { matchChain, matchGroceryBanner } from "@/server/discovery/chains";
import type { ResolvedStore, StoreDiscoveryProvider } from "@/server/discovery/provider";

const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const placeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,240}$/),
  displayName: z.object({ text: z.string().trim().min(1).max(500) }), formattedAddress: z.string().trim().min(1).max(2000),
  addressComponents: z.array(z.object({ shortText: z.string().optional(), types: z.array(z.string()).default([]) })),
  location: coordinate, googleMapsUri: z.string(), types: z.array(z.string()), primaryType: z.string().optional(), businessStatus: z.string().optional(),
  attributions: z.array(z.object({ provider: z.string().min(1), providerUri: z.string() })).optional(),
});
type Place = z.infer<typeof placeSchema>;
const geocodeSchema = z.object({ status: z.string(), results: z.array(z.object({
  partial_match: z.boolean().optional(), formatted_address: z.string().min(1),
  address_components: z.array(z.object({ short_name: z.string(), types: z.array(z.string()) })),
  geometry: z.object({ location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }) }),
})).optional() });
const PLACE_FIELDS = "id,displayName,formattedAddress,addressComponents,location,googleMapsUri,types,primaryType,businessStatus,attributions";
const groceryTypes = new Set(["grocery_store", "supermarket"]);
const excludedPrimaryTypes = new Set(["pharmacy", "drugstore", "gas_station", "convenience_store", "liquor_store", "wholesaler"]);
const providerError = () => new ServiceError(502, { code: "provider-error", message: "The store provider couldn’t complete the request. Please try again." });
const quotaError = () => new ServiceError(429, { code: "rate-limited", message: "Store search is busy. Please wait before trying again." });
const notFound = () => new ServiceError(404, { code: "not-found", message: "No matching location was found in the selected country." });

/** Per-process billing/concurrency guard. No postal codes, IPs or provider payloads are retained. */
export class GoogleRequestGate {
  private windowStarted = 0;
  private count = 0;
  private active = 0;
  constructor(private readonly limit = 60, private readonly concurrency = 4, private readonly now = Date.now) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const now = this.now();
    if (now - this.windowStarted >= 60_000) { this.windowStarted = now; this.count = 0; }
    if (this.count >= this.limit || this.active >= this.concurrency) throw quotaError();
    this.count++; this.active++;
    try { return await operation(); } finally { this.active--; }
  }
}
const requestGate = new GoogleRequestGate();
interface GoogleOptions { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; gate?: GoogleRequestGate }

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))));
}
function publicUri(value: string, mapsOnly = false): string {
  let uri: URL;
  try { uri = new URL(value); } catch { throw providerError(); }
  if (uri.protocol !== "https:" || uri.username || uri.password || [...uri.searchParams.keys()].some(key => /key|token|secret/i.test(key))
    || /^(places|maps)\.googleapis\.com$/.test(uri.hostname)
    || (mapsOnly && !["maps.google.com", "www.google.com", "maps.app.goo.gl"].includes(uri.hostname))) throw providerError();
  return uri.href;
}
function countryOf(place: Place): string | undefined { return place.addressComponents.find(item => item.types.includes("country"))?.shortText; }
function validGrocery(place: Place, country: Country): boolean {
  return countryOf(place) === country && place.types.some(type => groceryTypes.has(type))
    && !excludedPrimaryTypes.has(place.primaryType ?? "")
    && (Boolean(place.primaryType) || !place.types.some(type => excludedPrimaryTypes.has(type)))
    && matchGroceryBanner(place.displayName.text, country) !== null
    && (!place.businessStatus || place.businessStatus === "OPERATIONAL");
}
function identity(place: Place, country: Country): ResolvedStore {
  const chainId = matchChain(place.displayName.text, country);
  return { id: `google:${place.id}`, name: place.displayName.text, address: place.formattedAddress, country, chainId, source: "google",
    pricing: { status: "unavailable", profileId: null } };
}

export function createGoogleStoreDiscovery(options: GoogleOptions = {}): StoreDiscoveryProvider {
  const fetcher = options.fetcher ?? fetch;
  const gate = options.gate ?? requestGate;
  function key(): string {
    const value = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
    if (!value) throw new ServiceError(503, { code: "provider-not-configured", message: "Nearby store search is not configured." });
    return value;
  }
  async function json(url: URL | string, init: RequestInit = {}): Promise<unknown> {
    return gate.run(async () => {
      try {
        const signal = AbortSignal.timeout(options.timeoutMs ?? 5000);
        const response = await fetcher(url, { ...init, cache: "no-store", redirect: "error",
          signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal });
        if (response.status === 429) throw quotaError();
        if (response.status === 404) throw notFound();
        if (!response.ok) throw providerError();
        return await response.json();
      } catch (error) { if (error instanceof ServiceError) throw error; throw providerError(); }
    });
  }
  return {
    async discover(input) {
      const request = storeDiscoveryRequestSchema.parse(input);
      if (request.mode !== "live") invalidRequest("mode", "Google discovery requires explicit live mode.");
      const apiKey = key();
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", request.location.postalCode);
      url.searchParams.set("components", `country:${request.location.country}`);
      url.searchParams.set("region", request.location.country.toLowerCase());
      url.searchParams.set("key", apiKey);
      const geocoded = geocodeSchema.safeParse(await json(url));
      if (!geocoded.success) throw providerError();
      if (["OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT"].includes(geocoded.data.status)) throw quotaError();
      if (geocoded.data.status === "ZERO_RESULTS") throw notFound();
      if (geocoded.data.status !== "OK") throw providerError();
      const origin = geocoded.data.results?.find(result => {
        const component = (type: string) => result.address_components.find(item => item.types.includes(type))?.short_name;
        const normalized = (value: string) => value.replace(/\s/g, "").toUpperCase();
        const postal = component("postal_code");
        const suffix = component("postal_code_suffix");
        return !result.partial_match && component("country") === request.location.country && postal
          && normalized(suffix ? `${postal}-${suffix}` : postal) === normalized(request.location.postalCode);
      });
      if (!origin) throw notFound();
      const coordinates = { latitude: origin.geometry.location.lat, longitude: origin.geometry.location.lng };
      const response = z.object({ places: z.array(z.unknown()).max(20).optional() }).safeParse(await json("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_FIELDS.split(",").map(field => `places.${field}`).join(",") },
        body: JSON.stringify({ includedTypes: [...groceryTypes], maxResultCount: 20, rankPreference: "DISTANCE", languageCode: "en", regionCode: request.location.country,
          locationRestriction: { circle: { center: coordinates, radius: request.radiusKm * 1000 } } }),
      }));
      if (!response.success) throw providerError();
      const candidates: { store: GoogleStore; bannerId: string; place: Place }[] = [];
      const placeIds = new Set<string>();
      const attributions = new Map<string, Attribution>();
      for (const raw of response.data.places ?? []) {
        const parsed = placeSchema.safeParse(raw);
        if (!parsed.success) throw providerError();
        const place = parsed.data;
        if (!validGrocery(place, request.location.country)) continue;
        const distance = distanceMeters(coordinates, place.location);
        if (distance > request.radiusKm * 1000 || placeIds.has(place.id)) continue;
        placeIds.add(place.id);
        const base = identity(place, request.location.country);
        candidates.push({ bannerId: matchGroceryBanner(place.displayName.text, request.location.country)!.id, place,
          store: { ...base, source: "google", googlePlaceId: place.id, coordinates: place.location, distanceMeters: distance, googleMapsUri: publicUri(place.googleMapsUri, true) } });
      }
      candidates.sort((a, b) => a.store.distanceMeters - b.store.distanceMeters || a.store.id.localeCompare(b.store.id, "en"));
      const banners = new Set<string>();
      const stores: GoogleStore[] = [];
      for (const { bannerId, store, place } of candidates) {
        if (banners.has(bannerId)) continue;
        banners.add(bannerId);
        stores.push(store);
        for (const attribution of place.attributions ?? []) {
          const uri = publicUri(attribution.providerUri);
          attributions.set(`${attribution.provider}:${uri}`, { provider: "google-maps", displayName: attribution.provider, uri });
        }
      }
      return { mode: "live", location: { ...request.location, currency: currencyForCountry(request.location.country) },
        origin: { label: origin.formatted_address, coordinates }, radiusKm: request.radiusKm, stores,
        attributions: [...attributions.values()], notices: ["Major grocery chains · nearest location per banner.",
          "Only the nearest returned branch of each eligible banner is shown from up to 20 Google candidates. This bounded search does not establish every nearby chain or branch.",
          ...(stores.length ? [] : ["No eligible major grocery chains were returned in this search. Try a wider radius or another location; other stores may exist nearby."]),
          "Store names, addresses and locations are provided by Google Maps. Distances are straight-line, not driving distances.",
          "Store discovery does not supply product prices. Request verified pricing separately; sample optimization is available only in explicit demo mode."] };
    },
    async resolveStores(ids, country) {
      if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !/^google:[A-Za-z0-9_-]{1,240}$/.test(id))) invalidRequest("storeIds", "Select one to three different Google store IDs.");
      const apiKey = key();
      return Promise.all(ids.map(async id => {
        const placeId = id.slice("google:".length);
        let raw: unknown;
        try { raw = await json(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_FIELDS } }); }
        catch (error) { if (error instanceof ServiceError && error.status === 404) invalidRequest("storeIds", "A selected store no longer exists."); throw error; }
        const parsed = placeSchema.safeParse(raw);
        if (!parsed.success) throw providerError();
        if (parsed.data.id !== placeId || !validGrocery(parsed.data, country)) invalidRequest("storeIds", "A selected store is unavailable or is not an operating eligible major grocery chain in this country. Choose other stores.");
        return identity(parsed.data, country);
      }));
    },
  };
}
