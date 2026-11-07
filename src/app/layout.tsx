import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ShopMate — Eat better. Spend smarter.", template: "%s · ShopMate" },
  description: "Eat better. Spend smarter. Choose your country to get started with ShopMate.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <Header />
    <main id="main-content">{children}</main>
    <Footer />
  </body></html>;
}
