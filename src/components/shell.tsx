import Link from "next/link";
import { Brand } from "./brand";

export function Header() {
  return <header className="site-header app-width"><Brand /></header>;
}

export function Footer() {
  return <footer className="site-footer app-width"><Link href="/credits">Photo credits</Link></footer>;
}
