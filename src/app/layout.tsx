import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/shell";
import "./globals.css";

const dmSans = localFont({ src: "./fonts/dm-sans.ttf", variable: "--font-app", weight: "100 1000", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ShopMate", template: "%s · ShopMate" },
  description: "Your groceries, your budget, your meals. Discover grocery stores, compare available prices, and bring your next meal plan together with ShopMate.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={dmSans.variable} data-scroll-behavior="smooth"><body>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <Header />
    <main id="main-content">{children}</main>
  </body></html>;
}
