import Link from "next/link";
import { Icon } from "@/components/grocery-art";

export function Brand() {
  return <Link href="/" className="brand" aria-label="ShopMate home">
    <span className="brand-mark"><Icon name="basket" /></span><span>shopmate<span className="brand-dot">.</span></span>
  </Link>;
}
