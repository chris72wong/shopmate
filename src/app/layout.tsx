import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header, Footer } from "@/components/shell";
import "./globals.css";

const dmSans = localFont({ src: "./fonts/dm-sans.ttf", variable: "--font-app", weight: "100 1000", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ShopMate", template: "%s · ShopMate" },
  description: "Plan meals and compare grocery baskets for your household.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={dmSans.variable}><body>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <Header />
    <main id="main-content">{children}</main>
    <Footer />
  </body></html>;
}
