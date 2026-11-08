import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand" aria-label="ShopMate home">
    <span>shopmate<span className="brand-dot">.</span></span>
  </Link>;
}
