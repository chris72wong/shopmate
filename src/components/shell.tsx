import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "@/components/grocery-art";

export function Header() {
  return <header className="site-header page-width"><Brand /><nav aria-label="Main navigation"><Link className="header-how" href="/#how-it-works">How it works</Link><Link className="header-sample" href="/demo">Try demo <Icon name="arrow" /></Link></nav></header>;
}
