"use client";

import { useState } from "react";
import { retailerDomain, retailerInitials, retailerLogoUrl } from "@/lib/retailer-brands";
import type { RetailerIdentity } from "@/lib/retailer-brands";
import { Icon } from "@/components/grocery-art";

export function StoreLogo({ store }: { store: RetailerIdentity }) {
  const domain = retailerDomain(store);
  const src = retailerLogoUrl(domain, process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;

  return <span className={`retailer-logo ${store.source === "demo" ? "is-fictional" : ""}`} aria-hidden="true">
    <span className="retailer-fallback">{store.source === "demo" ? <Icon name="basket" /> : retailerInitials(domain?.split(".")[0] ?? store.name)}</span>
    {showImage && (
      // Brandfetch requires a direct hotlink with the origin Referer, without an image proxy/cache.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={120} height={60} loading="lazy" decoding="async" referrerPolicy="strict-origin"
        className={loadedSrc === src ? "is-loaded" : ""} onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} />
    )}
  </span>;
}
