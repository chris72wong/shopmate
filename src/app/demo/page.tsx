import type { Metadata } from "next";
import Link from "next/link";
import { RecipeCard } from "@/components/recipe-card";
import type { Country } from "@/contracts";
import { recipes } from "@/data/recipes";
import { formatMoney } from "@/lib/format";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { illustrativePricing } from "@/server/pricing/illustrative";

export const metadata: Metadata = { title: "Demo stores" };

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
    <div className="demo-heading"><h1>Demo stores</h1><p>Fictional stores. Illustrative prices. Not based on your location.</p></div>
    <section className="demo-stores" aria-labelledby="stores-title">
      <div className="section-heading"><h2 id="stores-title" className="sr-only">Fictional stores</h2><Link href="/" className="text-link">← Start over</Link>
        <nav className="country-switch" aria-label="Demo currency"><Link href="/demo?country=CA" aria-current={country === "CA" ? "page" : undefined}>Canada · CAD</Link><Link href="/demo?country=US" aria-current={country === "US" ? "page" : undefined}>US · USD</Link></nav>
      </div>
      <div className="store-grid">{previews.map(({ store, offer }) => <article className="store-card" key={store.id}><h3>{store.name}</h3><p>{store.address}</p><div className="sample-price"><strong>1 kg gluten-free oats</strong><span>{offer ? formatMoney(offer.price) : "Pricing unavailable"}</span></div></article>)}</div>
    </section>
    <details id="recipes" className="recipe-library"><summary><span>Browse recipes</span><span className="recipe-count">14</span></summary><div className="recipe-grid">{recipes.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} index={index} />)}</div><p className="section-note">Estimated nutrition. Check product labels for allergens.</p></details>
  </div>;
}
