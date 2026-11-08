import Link from "next/link";
import { GroceryTote, Icon, MealArt } from "@/components/grocery-art";

const howItWorks = [
  { icon: "pin", title: "Find your stores", copy: "Enter your location and discover nearby major grocery chains.", note: "Start in your neighbourhood", colour: "sage" },
  { icon: "receipt", title: "Compare your options", copy: "Explore available ingredient prices and grocery costs.", note: "See what’s available", colour: "apricot" },
  { icon: "bowl", title: "Plan your meals", copy: "Get personalized recipes and shopping lists for your budget and preferences.", note: "Bring something good to the table", colour: "butter" },
] as const;

export function Homepage() {
  return <div className="homepage">
    <section className="hero page-width" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow"><span className="tiny-spark">✳</span> YOUR EVERYDAY GROCERY SIDEKICK</p>
        <h1 id="hero-title">Your groceries.<br />Your budget.<br /><span className="hero-highlight">Your kind of meals.<svg viewBox="0 0 550 20" aria-hidden="true"><path d="M3 12C147 1 364 1 546 10M41 18c180-8 293-5 431-2" /></svg></span></h1>
        <p className="hero-description">Tell us where you shop and what you want to spend. Find stores, compare available prices, and plan meals that feel like you. All in one place.</p>
        <div className="hero-actions"><Link href="/plan" className="button button-primary">Let’s make a plan <Icon name="arrow" /></Link><Link href="/demo" className="hero-sample">Take a sample spin <span aria-hidden="true">↗</span></Link></div>
        <p className="hero-fineprint">Made for your appetite. Mindful of your budget.</p>
      </div>
      <div className="hero-art">
        <div className="handwritten hero-note">a little planning,<br />a lot of good food.<svg viewBox="0 0 90 65" aria-hidden="true"><path d="M10 4c63-2 74 19 36 49m-4-16 2 20 20-6" /></svg></div>
        <GroceryTote />
        <div className="hero-sticker"><Icon name="leaf" /><span>GOOD FOOD.<br />LESS GUESSWORK.</span></div>
        <div className="meal-slip"><MealArt kind="pasta" /><div><small>ON THE MENU</small><strong>More “what’s cooking?”<br />Less “what’s for dinner?”</strong></div><Icon name="check" /></div>
      </div>
    </section>
    <div className="pantry-strip" aria-label="Stores, prices, meals, one happy plan"><div className="page-width"><span><Icon name="pin" /> Your local stores</span><span className="strip-flower" aria-hidden="true">✳</span><span><Icon name="receipt" /> Your grocery budget</span><span className="strip-flower" aria-hidden="true">✳</span><span><Icon name="bowl" /> Your next favourite meal</span></div></div>
    <section id="how-it-works" className="how-section page-width" aria-labelledby="how-title">
      <div className="section-intro"><div><p className="eyebrow">FROM “WHAT IF?” TO “WHAT’S FOR DINNER?”</p><h2 id="how-title">One little plan.<br /><span>Everything comes together.</span></h2></div><p>Grocery discovery, price comparison and meal planning. A simpler way to get from your shopping bag to your dinner table.</p></div>
      <ol className="how-grid">{howItWorks.map((step, index) => <li key={step.title}><Link href="/plan" className={`how-card colour-${step.colour}`} aria-label={`Start planning: ${step.title}`}><div className="how-card-top"><span className="how-icon"><Icon name={step.icon} /></span><span className="step-number">0{index + 1}</span></div><h3>{step.title}</h3><p>{step.copy}</p><span className="how-card-note">{step.note}<Icon name="arrow" /></span></Link></li>)}</ol>
      <p className="coverage-note"><Icon name="receipt" /> Live price coverage varies by store. The sample experience uses fictional stores and illustrative prices.</p>
    </section>
    <section className="sample-section page-width" aria-labelledby="sample-title"><div className="sample-food"><MealArt kind="bowl" /><span className="handwritten">a good plan<br />looks good on you.</span><span className="sample-food-spark" aria-hidden="true">✳</span></div><div className="sample-copy"><p className="eyebrow">A TASTE OF WHAT’S POSSIBLE</p><h2 id="sample-title">Less dinner dilemma.<br />More dinner delight.</h2><p>Pick your budget. Add your preferences. Leave with meal ideas and a shopping list you can actually use.</p><Link href="/demo" className="button button-primary">Try the sample experience <Icon name="arrow" /></Link><p className="small-note">Fictional stores · illustrative prices · estimated nutrition</p></div></section>
    <section className="home-question page-width"><details><summary>What should I know about prices?<span aria-hidden="true">+</span></summary><p>Live planning requires verified prices for every ingredient in a meal plan. Some stores won’t have that coverage yet. We’ll show you when pricing is unavailable. You can always explore the separate sample experience with clearly labeled illustrative prices.</p></details></section>
  </div>;
}
