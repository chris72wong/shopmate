import Link from "next/link";
import { Icon } from "@/components/grocery-art";
import { AnimatedGroceries } from "@/components/animated-groceries";

const howItWorks = [
  { icon: "bowl", title: "Make it yours", copy: "Fresh meal ideas for your table.", colour: "sage" },
  { icon: "list", title: "One clever grocery list", copy: "Shared ingredients, added up for you.", colour: "apricot" },
  { icon: "basket", title: "Ready for your next shop", copy: "Check, copy, download and search.", colour: "butter" },
] as const;

export function Homepage() {
  return <div className="homepage">
    <section className="hero page-width" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Good food.<br /><span>Less fuss.</span></h1>
        <p className="hero-description">Fresh meal ideas. One grocery list. A little less on your plate.</p>
        <Link href="/plan" className="button button-primary">Start planning <Icon name="arrow" /></Link>
      </div>
      <AnimatedGroceries />
    </section>
    <section id="how-it-works" className="how-section page-width" aria-labelledby="how-title">
      <h2 id="how-title" className="sr-only">How it works</h2>
      <ol className="how-grid">{howItWorks.map(step => <li key={step.title}><Link href="/plan" className="how-card" aria-label={`Start planning: ${step.title}`}><span className={`how-icon colour-${step.colour}`}><Icon name={step.icon} /></span><div><h3>{step.title}</h3><p>{step.copy}</p></div></Link></li>)}</ol>
      <p className="coverage-note">AI-generated recipes. Real retailer search links. No invented prices.</p>
    </section>
  </div>;
}
