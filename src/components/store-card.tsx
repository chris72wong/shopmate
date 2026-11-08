import type { Store, StoreV2 } from "@/contracts";
import { StoreLogo } from "@/components/store-logo";
import { Icon } from "@/components/grocery-art";
import { safeExternalUrl } from "@/lib/planner";

export function StoreCard({ store, selected, disabled, onToggle }: { store: Store | StoreV2; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const mapsUrl = store.googleMapsUri ? safeExternalUrl(store.googleMapsUri) : undefined;
  return <article className={`store-row ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}>
    <label className="store-choice">
      <StoreLogo store={store} />
      <span className="store-info"><strong>{store.name}</strong><span className="store-address">{store.address}</span>
        <span className="store-badges">
          {store.source === "google" && <span className="distance-badge"><Icon name="pin" />{(store.distanceMeters / 1000).toFixed(1)} km <span className="sr-only">straight-line distance</span></span>}
          <span className={`pricing-badge ${store.pricing.status === "unavailable" ? "is-unavailable" : ""}`}>
            {store.pricing.status === "unavailable" ? "Pricing unavailable" : store.pricing.status === "verified-capable" ? `Price check supported · ${store.pricing.channel}` : "Illustrative prices"}
          </span>
        </span>
      </span>
      <input className="sr-only" type="checkbox" aria-label={`Compare ${store.name}`} checked={selected} disabled={disabled} onChange={onToggle} />
      <span className="store-selection" aria-hidden="true">{selected ? <Icon name="check" /> : "+"}</span>
    </label>
    {mapsUrl && <a className="map-link" target="_blank" rel="noreferrer" href={mapsUrl}>View on Google Maps <span aria-hidden="true">↗</span></a>}
  </article>;
}
