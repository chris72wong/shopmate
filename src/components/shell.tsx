import { Brand } from "./brand";

export function Header() {
  return <header className="site-header page-width">
    <Brand />
  </header>;
}

export function Footer() {
  return <footer className="site-footer page-width">
    <p>Eat better. Spend smarter.</p>
  </footer>;
}
