import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "@/components/grocery-art";

export function Header() {
  return <header className="site-header page-width"><Brand /><nav aria-label="Main navigation"><Link className="header-how" href="/#how-it-works">How it works</Link><Link className="header-sample" href="/demo">Try a sample <Icon name="arrow" /></Link></nav></header>;
}

export function Footer() {
  return <footer className="site-footer page-width"><Brand /><p>A little planning. A lot of good food.</p><span>Made for everyday appetites.</span></footer>;
}
