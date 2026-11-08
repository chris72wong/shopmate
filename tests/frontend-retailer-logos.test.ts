import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Country, GoogleStore, StoreV2 } from "@/contracts";
import { StoreCard } from "@/components/store-card";
import { StoreLogo } from "@/components/store-logo";
import { retailerDomain, retailerInitials, retailerLogoUrl } from "@/lib/retailer-brands";

// Synthetic identities only; never served as discovery results.
const identity = (name: string, country: Country = "CA") => ({ name, country, source: "google" as const, chainId: null });
const store: GoogleStore = { ...identity("Loblaws"), id: "google:synthetic-logo", googlePlaceId: "synthetic-logo",
  address: "Synthetic test address", coordinates: { latitude: 0, longitude: 0 }, distanceMeters: 1250,
  pricing: { status: "unavailable", profileId: null }, googleMapsUri: "https://maps.google.com/?cid=1" };

afterEach(() => vi.unstubAllEnvs());

describe("retailer display identity", () => {
  it.each([
    ["Loblaws", "loblaws.ca"], ["No Frills", "nofrills.ca"], ["Real Canadian Superstore", "realcanadiansuperstore.ca"],
    ["Atlantic Superstore", "atlanticsuperstore.ca"], ["Zehrs", "zehrs.ca"], ["Fortinos", "fortinos.ca"],
    ["Your Independent Grocer", "yourindependentgrocer.ca"], ["Valu-Mart", "valumart.ca"], ["Provigo", "provigo.ca"],
    ["Maxi", "maxi.ca"], ["Dominion", "dominionstores.ca"], ["Sobeys", "sobeys.com"], ["Safeway", "safeway.ca"],
    ["IGA", "iga.ca"], ["Foodland", "foodland.ca"], ["FreshCo", "freshco.com"], ["Thrifty Foods", "thriftyfoods.com"],
    ["Longo’s", "longos.com"], ["Farm Boy", "farmboy.ca"], ["Metro", "metro.ca"], ["Food Basics", "foodbasics.ca"],
    ["Super C", "superc.ca"], ["Save-On-Foods", "saveonfoods.com"], ["Walmart", "walmart.ca"],
  ])("keeps the Canadian %s banner on its own official domain", (name, domain) => {
    expect(retailerDomain(identity(name))).toBe(domain);
  });

  it.each([
    ["ALDI", "aldi.us"], ["Lidl", "lidl.com"], ["Kroger", "kroger.com"], ["Ralphs", "ralphs.com"],
    ["Fred Meyer", "fredmeyer.com"], ["Fry’s", "frysfood.com"], ["King Soopers", "kingsoopers.com"],
    ["City Market", "citymarket.com"], ["Smith’s", "smithsfoodanddrug.com"], ["Dillons", "dillons.com"],
    ["Baker’s", "bakersplus.com"], ["Gerbes", "gerbes.com"], ["QFC", "qfc.com"], ["Pick ’n Save", "picknsave.com"],
    ["Metro Market", "metromarket.net"], ["Mariano’s", "marianos.com"], ["Food 4 Less", "food4less.com"],
    ["Foods Co", "foodsco.net"], ["Jay C", "jaycfoods.com"], ["Pay-Less", "pay-less.com"], ["Harris Teeter", "harristeeter.com"],
    ["Albertsons", "albertsons.com"], ["Safeway", "safeway.com"], ["Vons", "vons.com"], ["Pavilions", "pavilions.com"],
    ["Jewel-Osco", "jewelosco.com"], ["ACME", "acmemarkets.com"], ["Shaw’s", "shaws.com"], ["Star Market", "starmarket.com"],
    ["Tom Thumb", "tomthumb.com"], ["Randalls", "randalls.com"], ["United Supermarkets", "unitedsupermarkets.com"],
    ["Market Street", "marketstreetunited.com"], ["Carrs", "carrsqc.com"], ["Haggen", "haggen.com"],
    ["Food Lion", "foodlion.com"], ["Hannaford", "hannaford.com"], ["Stop & Shop", "stopandshop.com"],
    ["Publix", "publix.com"], ["H-E-B", "heb.com"], ["Meijer", "meijer.com"], ["Wegmans", "wegmans.com"],
    ["WinCo", "wincofoods.com"], ["Hy-Vee", "hy-vee.com"], ["ShopRite", "shoprite.com"],
    ["Giant Eagle", "gianteagle.com"], ["Grocery Outlet", "groceryoutlet.com"], ["Save A Lot", "savealot.com"],
  ])("keeps the American %s banner on its own official domain", (name, domain) => {
    expect(retailerDomain(identity(name, "US"))).toBe(domain);
  });

  it("uses identical logos for supported branch-name variants", () => {
    const urls = ["No Frills", "Doug’s No Frills", "Ken's No Frills"].map(name => retailerLogoUrl(retailerDomain(identity(name)), "test-client"));
    expect(new Set(urls).size).toBe(1);
    expect(retailerDomain(identity("Publix Super Market at Test Plaza", "US"))).toBe("publix.com");
    expect(retailerDomain(identity("ShopRite of Test Town", "US"))).toBe("shoprite.com");
    expect(retailerDomain(identity("Walmart Supercentre"))).toBe("walmart.ca");
    expect(retailerDomain(identity("Walmart Neighborhood Market", "US"))).toBe("walmart.com");
  });

  it("separates regional banners that discovery broadly groups", () => {
    expect(retailerDomain(identity("Giant Food", "US"))).toBe("giantfood.com");
    expect(retailerDomain(identity("Giant Food Stores", "US"))).toBe("giantfoodstores.com");
    expect(retailerDomain(identity("Giant", "US"))).toBeNull();
    expect(retailerDomain(identity("Martin’s Food Markets", "US"))).toBe("martinsfoods.com");
    expect(retailerDomain(identity("Martin’s Super Markets", "US"))).toBe("martinsgroceriestogo.com");
    expect(retailerDomain(identity("Martin’s", "US"))).toBeNull();
    expect(retailerDomain(identity("Albertsons Market", "US"))).toBe("albertsonsmarket.com");
    expect(retailerDomain(identity("Market District", "US"))).toBe("marketdistrict.com");
  });

  it("never guesses a brand from a fictional, unknown, wrong-country or pharmacy identity", () => {
    expect(retailerDomain({ ...identity("Loblaws"), source: "demo" })).toBeNull();
    for (const name of ["Loblaws Pharmacy", "Loblaws Local Grocery", "Not A Chain"]) expect(retailerDomain(identity(name))).toBeNull();
    expect(retailerDomain(identity("Kroger"))).toBeNull();
    expect(retailerDomain(identity("Loblaws", "US"))).toBeNull();
  });
});

describe("direct logo embeds and truthful store cards", () => {
  it("requires the app's own client ID and only sends an allowlisted domain to Brandfetch", () => {
    expect(retailerLogoUrl("loblaws.ca", undefined)).toBeNull();
    expect(retailerLogoUrl("loblaws.ca", " ")).toBeNull();
    expect(retailerLogoUrl(null, "test-client")).toBeNull();
    expect(retailerLogoUrl("attacker.example/private?postal=M5V2T6", "test-client")).toBeNull();
    const url = new URL(retailerLogoUrl("loblaws.ca", "public&client")!);
    expect(url.origin).toBe("https://cdn.brandfetch.io");
    expect(url.pathname).toBe("/domain/loblaws.ca/w/240/h/120/theme/dark/fallback/404/type/logo");
    expect([...url.searchParams]).toEqual([["c", "public&client"]]);
  });

  it("keeps useful local initials without making a network request when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "");
    const html = renderToStaticMarkup(createElement(StoreLogo, { store }));
    expect(html).toContain("retailer-fallback");
    expect(html).toContain(">L</span>");
    expect(html).not.toContain("<img");
    expect(retailerInitials("  Neighborhood Market ")).toBe("NM");
    expect(retailerInitials("")).toBe("SM");
  });

  it("hotlinks lazily with an origin referrer and does not proxy, recolor or source Places photos", () => {
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "test-client");
    const html = renderToStaticMarkup(createElement(StoreLogo, { store }));
    expect(html).toContain("https://cdn.brandfetch.io/domain/loblaws.ca/");
    expect(html).toContain('referrerPolicy="strict-origin"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt=""');
    expect(html).not.toMatch(/_next\/image|places\.googleapis|\/photos\//);
    expect(renderToStaticMarkup(createElement(StoreLogo, { store: { ...store, source: "demo" } }))).not.toContain("<img");
  });

  it("displays distance and unavailable pricing beside a recognizable identity without implying live prices", () => {
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "");
    const html = renderToStaticMarkup(createElement(StoreCard, { store, selected: true, disabled: false, onToggle: () => undefined }));
    expect(html).toContain(store.name);
    expect(html).toContain("1.3");
    expect(html).toContain("straight-line distance");
    expect(html).toContain("Pricing unavailable");
    expect(html).toContain('aria-label="Compare Loblaws"');
    expect(html).toContain('checked=""');
    expect(html).not.toMatch(/Verified prices|Illustrative prices|Basket total/);
    const capable: StoreV2 = { ...store, pricing: { status: "verified-capable", providerId: "reef-loblaws", channel: "pickup" } };
    expect(renderToStaticMarkup(createElement(StoreCard, { store: capable, selected: false, disabled: true, onToggle: () => undefined }))).toContain("Price check supported · pickup");
  });
});
