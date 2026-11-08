"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { LocationInput, StoreDiscoveryResult } from "@/contracts";
import { currencyForCountry, storeDiscoveryRequestSchema } from "@/contracts";
import { Icon } from "@/components/grocery-art";
import { discoveryViewSchema, PlannerApiError, postPlanner } from "@/lib/planner-api";
import { safeExternalUrl } from "@/lib/planner";

type DiscoveryState =
  | { status: "idle" }
  | { status: "loading"; locationKey: string }
  | { status: "error"; locationKey: string; message: string }
  | { status: "ready"; locationKey: string; result: StoreDiscoveryResult };

/** Optional provider lookup, separate from meal generation and retailer searches.
 * Google search responses stay only in component memory until location/unmount.
 */
export function NearbyGrocers({ location }: { location: LocationInput }) {
  const [state, setState] = useState<DiscoveryState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const locationKey = `${location.country}:${location.postalCode.trim().toUpperCase()}`;
  const visible = state.status !== "idle" && state.locationKey === locationKey ? state : { status: "idle" as const };
  const busy = visible.status === "loading";

  useEffect(() => () => { request.current?.abort(); }, [locationKey]);

  async function findGrocers() {
    const parsed = storeDiscoveryRequestSchema.safeParse({ mode: "live", location, radiusKm: 5 });
    if (!parsed.success) {
      setState({ status: "error", locationKey, message: "Check your postal or ZIP code in your plan settings first." });
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 25_000);
    setState({ status: "loading", locationKey });
    try {
      const result = await postPlanner("/api/stores", parsed.data, discoveryViewSchema, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      if (result.mode !== "live" || result.location.country !== location.country
        || result.location.currency !== currencyForCountry(location.country)
        || result.location.postalCode !== parsed.data.location.postalCode
        || result.stores.some(store => store.source !== "google" || store.country !== location.country)) {
        throw new PlannerApiError("invalid-response", "The stores didn’t match your location. Please try again.");
      }
      setState({ status: "ready", locationKey, result });
    } catch (error) {
      if (request.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setState({ status: "error", locationKey, message: timedOut ? "The store search took too long. Try again."
        : error instanceof PlannerApiError ? error.message : "Nearby stores couldn’t be loaded. Please try again." });
    } finally {
      window.clearTimeout(deadline);
      if (request.current === controller) request.current = null;
    }
  }

  return <section className="nearby-grocers" aria-labelledby="nearby-grocers-title" aria-busy={busy}>
    <h3 id="nearby-grocers-title">Prefer to shop in person?</h3>
    <p className="small-note">Find grocery stores within 5 km. Store prices and stock aren’t checked.</p>
    <button type="button" className="button button-secondary" disabled={busy} onClick={findGrocers}>
      <Icon name="pin" />{busy ? "Finding nearby grocers…" : visible.status === "ready" ? "Refresh nearby grocers" : "Find nearby grocers"}
    </button>
    <div aria-live="polite">
      {visible.status === "loading" && <p className="small-note" role="status">Searching Google Maps…</p>}
      {visible.status === "error" && <p className="field-error" role="alert">{visible.message}</p>}
      {visible.status === "ready" && <>
        {visible.result.stores.length === 0 ? <p className="small-note">No grocery stores were returned within 5 km. Your shopping list is still ready to use.</p>
          : <ul className="store-list" aria-label="Nearby grocery stores">{visible.result.stores.map(store => {
            const mapsUrl = safeExternalUrl(store.googleMapsUri ?? "");
            return <li className="store-row" key={store.id}>
              <div className="store-info"><strong>{store.name}</strong><span className="store-address">{store.address}</span>
                {store.distanceMeters !== null && <span className="small-note">{(store.distanceMeters / 1000).toFixed(1)} km straight-line distance</span>}
              </div>
              {mapsUrl && <a className="map-link" href={mapsUrl} target="_blank" rel="noreferrer">View on Google Maps ↗</a>}
            </li>;
          })}</ul>}
        <div className="google-attribution">
          <Image src="/google-maps-logo.svg" alt="Google Maps" width={100} height={18} unoptimized />
          {visible.result.attributions.map((item, index) => {
            const attributionUrl = safeExternalUrl(item.uri);
            return <span key={`${item.displayName}-${index}`}>{attributionUrl
              ? <a href={attributionUrl} target="_blank" rel="noreferrer">{item.displayName}</a> : item.displayName}</span>;
          })}
        </div>
      </>}
    </div>
  </section>;
}
