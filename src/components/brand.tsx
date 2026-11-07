import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand" aria-label="ShopMate home">
    <svg viewBox="0 0 36 40" fill="none" aria-hidden="true">
      <path d="M8 14h20l3 22H5l3-22Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M13 15v-4a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 29c-7-1-8-7-7-10 6 0 9 3 7 10Z" fill="currentColor" />
      <path d="M18 29c0-6 3-9 9-10 0 6-3 9-9 10Z" fill="currentColor" opacity=".55" />
    </svg>
    <span>shopmate<span className="brand-dot">.</span></span>
  </Link>;
}
