import Image from "next/image";
import type { StoreDiscoveryResult } from "@/contracts";
import { safeExternalUrl } from "@/lib/planner";
import { storeShoppingOption, storeWebsiteLink } from "@/lib/store-shopping";
import { Icon } from "@/components/grocery-art";

export function GoogleStoreCredit({ discovery }: { discovery: StoreDiscoveryResult }) {
  return <div className="google-attribution"><Image src="/google-maps-logo.svg" alt="Google Maps" width={100} height={18} unoptimized />{discovery.attributions.map((item, index) => {
    const url = safeExternalUrl(item.uri);
    return <span key={`${item.displayName}-${index}`}>{url ? <a href={url} target="_blank" rel="noreferrer">{item.displayName}</a> : item.displayName}</span>;
  })}</div>;
}

export function StorePicker({ discovery, busy, error, selectedId, radiusKm, onSelect, onRadius, onSearch, onContinue, onRegional }: {
  discovery: StoreDiscoveryResult | null; busy: boolean; error: string; selectedId: string | null; radiusKm: number;
  onSelect: (id: string) => void; onRadius: (radius: number) => void; onSearch: () => void; onContinue: () => void; onRegional: () => void;
}) {
  const selected = discovery?.stores.find(store => store.id === selectedId);
  const notices = discovery?.notices.filter(notice => !/sample optimization|request verified pricing/i.test(notice)) ?? [];
  return <div className="meal-store-picker">
    <p className="meal-store-intro">Pick a grocer for your shopping list. Online searches are retailer-wide; store stock and delivery are confirmed on the retailer’s website.</p>
    <div className="meal-store-search"><label htmlFor="meal-store-radius">Search within</label><select id="meal-store-radius" value={radiusKm} disabled={busy} onChange={event => onRadius(Number(event.target.value))}>{[5, 10, 25].map(radius => <option key={radius} value={radius}>{radius} km</option>)}</select><button type="button" className="text-button" disabled={busy} onClick={onSearch}>{busy ? "Finding grocers…" : "Search again"}</button></div>
    {busy && <div className="meal-loading" role="status"><Icon name="pin" /><div><strong>Finding your nearby grocers…</strong><p>Your meal ideas are next.</p></div></div>}
    {error && <div className="meal-error" role="alert"><strong>Nearby stores couldn’t be loaded</strong><p>{error}</p></div>}
    {!busy && discovery && <>
      <p className="meal-store-origin">Near {discovery.origin.label}</p>
      {discovery.stores.length ? <fieldset><legend className="sr-only">Choose your grocery store</legend><div className="meal-store-options">{discovery.stores.map(store => {
        const option = storeShoppingOption(store);
        const website = storeWebsiteLink(store);
        const mapsUrl = safeExternalUrl(store.googleMapsUri ?? "");
        return <div className={`meal-store-option ${selectedId === store.id ? "is-selected" : ""}`} key={store.id}><label><input type="radio" name="meal-store" value={store.id} checked={selectedId === store.id} onChange={() => onSelect(store.id)} /><span className="meal-store-details"><strong>{store.name}</strong><span>{store.address}</span><small>{store.distanceMeters !== null ? `${(store.distanceMeters / 1000).toFixed(1)} km straight-line · ` : ""}{option ? "Online ingredient searches" : "Take your list in person"}</small></span></label><div className="meal-store-links">{mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">View on Maps ↗</a>}{website && <a href={website.url} target="_blank" rel="noreferrer">Retailer website ↗</a>}</div></div>;
      })}</div></fieldset> : <div className="meal-store-empty"><h2>No grocers returned nearby</h2><p>Try a wider radius, or continue with regional retailer searches.</p></div>}
      <GoogleStoreCredit discovery={discovery} />
      {notices.length > 0 && <details className="meal-store-notices"><summary>About these results</summary><ul>{notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></details>}
    </>}
    <div className="flow-actions"><button type="button" className="button button-primary" disabled={!selected || busy} onClick={onContinue}>Continue with this store <Icon name="arrow" /></button></div>
    <button type="button" className="meal-regional-choice text-button" disabled={busy} onClick={onRegional}>Continue with regional shopping links</button>
    <p className="small-note">Regional links don’t select a nearby branch. No cart or delivery booking is created.</p>
  </div>;
}
