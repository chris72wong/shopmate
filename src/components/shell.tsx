import Link from "next/link";
import { Brand } from "./brand";

export function Header() {
  return <header className="site-header page-width">
    <Brand />
    <nav aria-label="Main navigation" className="main-nav">
      <Link href="/#how-it-works">How it works</Link>
      <Link href="/demo#recipes">The pantry</Link>
    </nav>
    <Link href="/demo" className="button button-small button-outline">Explore demo <span aria-hidden="true">↗</span></Link>
  </header>;
}

export function Footer() {
  return <footer className="site-footer page-width">
    <div><Brand /><p>Good food. Thoughtful choices. A little more left over.</p></div>
    <div className="footer-note"><span>Made for UB Hacking 2026</span><span>Foundation preview · Illustrative data</span></div>
  </footer>;
}
