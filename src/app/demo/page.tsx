import type { Metadata } from "next";
import Link from "next/link";
import { RecipeCard } from "@/components/recipe-card";
import type { Country } from "@/contracts";
import { recipes } from "@/data/recipes";
import { formatMoney } from "@/lib/format";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { illustrativePricing } from "@/server/pricing/illustrative";

export const metadata: Metadata = { title: "The demo pantry" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const query = await searchParams;
  const country: Country = query.country === "US" ? "US" : "CA";
  const discovery = await demoStoreDiscovery.discover({ mode: "demo", location: {
    country, postalCode: country === "CA" ? "M5V 2T6" : "14201",
  }, radiusKm: 5 });
  const previews = await Promise.all(discovery.stores.map(async (store) => {
    const result = await illustrativePricing.getOffers(store, ["pkg-oats"]);
    return { store, offer: result.status === "available" ? result.offers[0] : undefined };
  }));

  return <div className="page-width demo-page">
    <div className="demo-heading"><span className="eyebrow">THE SHOPMATE PREVIEW</span><h1>A small taste<br /><em>of a better week.</em></h1><p>Meet the ingredients of ShopMate: simple recipes and a clearly labeled sample grocery catalog.</p></div>
    <aside className="demo-notice"><strong>You’re in demo mode.</strong> These stores and addresses are fictional. Prices are illustrative examples, not live retailer prices. This preview does not search your location or generate a meal plan.</aside>
    <section className="demo-stores" aria-labelledby="stores-title">
      <div className="section-heading"><div><span className="eyebrow">FICTIONAL STORES · SAMPLE PRICES</span><h2 id="stores-title">A neighborhood, imagined.</h2></div>
        <nav className="country-switch" aria-label="Demo currency"><Link href="/demo?country=CA" aria-current={country === "CA" ? "page" : undefined}>Canada · CAD</Link><Link href="/demo?country=US" aria-current={country === "US" ? "page" : undefined}>US · USD</Link></nav>
      </div>
      <div className="store-grid">{previews.map(({ store, offer }, index) => <article className="store-card" key={store.id}><span className="store-icon" aria-hidden="true">0{index + 1}</span><span className="store-label">FICTIONAL DEMO STORE</span><h3>{store.name}</h3><p>{store.address}</p><div className="sample-price"><div><span>Sample package</span><strong>1 kg gluten-free oats</strong></div><span>{offer ? formatMoney(offer.price) : "Pricing unavailable"}</span></div><span className="nutrition-note">Illustrative price · No nearby distance</span></article>)}</div>
    </section>
    <section id="recipes" className="demo-recipes" aria-labelledby="recipes-title"><div className="section-heading"><div><span className="eyebrow">THE RECIPE PANTRY</span><h2 id="recipes-title">Everyday food. Plenty of possibility.</h2></div><span className="recipe-count">14 curated recipes</span></div><div className="recipe-grid">{recipes.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} index={index} />)}</div><p className="section-note">Nutrition values are project-authored estimates. Dietary labels describe sample ingredients; always check product labels for allergens and cross-contact.</p></section>
  </div>;
}
