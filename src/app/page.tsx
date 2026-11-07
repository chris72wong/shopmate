import Link from "next/link";
import { FoodIllustration } from "@/components/food-illustration";
import { RecipeCard } from "@/components/recipe-card";
import { recipeById } from "@/data/recipes";

const featured = ["chickpea-rice-bowl", "lemon-lentil-soup", "egg-potato-skillet"].map((id) => recipeById[id]!);
const steps = [
  ["Start close to home", "Enter your postal or ZIP code and choose up to three grocery stores."],
  ["Make it your own", "Set a weekly budget, servings, and the foods that work for you."],
  ["Let ingredients go further", "Find meals that share ingredients and account for whole packages."],
  ["See the bigger picture", "Compare a complete basket, with meals and one thoughtful shopping list."],
];

export default function Home() {
  return <>
    <section className="hero page-width" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="eyebrow"><span className="tiny-sprout" aria-hidden="true">✳</span> A fresh approach to your weekly shop</span>
        <h1 id="hero-title">Eat better.<br /><em>Spend smarter.</em></h1>
        <p className="hero-description">Good meals start with a little planning. Make room for food you love, a budget that works, and less going to waste.</p>
        <div className="hero-actions"><Link href="/demo" className="button button-primary">Take a look inside <span aria-hidden="true">↗</span></Link><a href="#how-it-works" className="text-link">Meet ShopMate <span aria-hidden="true">↓</span></a></div>
        <p className="hero-footnote"><span className="status-dot" /> Early preview · No account or API key needed</p>
      </div>
      <div className="hero-visual">
        <div className="visual-topline"><span>THE EVERYDAY TABLE</span><span>01 / 14</span></div>
        <FoodIllustration />
        <div className="hero-recipe-caption"><span className="caption-kicker">A LITTLE INSPIRATION</span><h2>Lemony chickpea rice bowls</h2><p>Simple ingredients. A brighter kind of everyday.</p></div>
        <span className="visual-stamp">made for<br /><em>real life</em></span>
      </div>
    </section>
    <div className="preview-banner page-width"><span className="preview-label">A small taste of what’s coming</span><p>Explore our recipe pantry and fictional demo stores. Grocery prices are illustrative; planning and live store search are still being built.</p></div>
    <section id="how-it-works" className="how-section page-width" aria-labelledby="how-title">
      <div className="section-heading"><div><span className="eyebrow">THOUGHTFULLY CONNECTED</span><h2 id="how-title">From “what’s for dinner?”<br />to a week that works.</h2></div><p>The journey we’re building, one good choice at a time.</p></div>
      <ol className="journey-grid">{steps.map(([title, description], index) => <li key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
    </section>
    <section className="pantry-section page-width" aria-labelledby="pantry-title">
      <div className="section-heading"><div><span className="eyebrow">LESS FUSS. MORE FLAVOR.</span><h2 id="pantry-title">Good things in the pantry.</h2></div><Link href="/demo#recipes" className="text-link">Explore all 14 recipes <span aria-hidden="true">↗</span></Link></div>
      <div className="recipe-grid">{featured.map((recipe, index) => <RecipeCard key={recipe.id} recipe={recipe} index={index} />)}</div>
      <p className="section-note">Curated sample recipes · Estimated nutrition · Original food illustrations</p>
    </section>
  </>;
}
