import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/shell";
import "./globals.css";

const dmSans = localFont({ src: "./fonts/dm-sans.ttf", variable: "--font-app", weight: "100 1000", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ShopMate", template: "%s · ShopMate" },
  description: "Fresh AI meal ideas for your household, combined into one practical grocery list. Swap meals, check your pantry, and shop with retailer search links.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={dmSans.variable} data-scroll-behavior="smooth"><body>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <Header />
    <main id="main-content">{children}</main>
  </body></html>;
}
