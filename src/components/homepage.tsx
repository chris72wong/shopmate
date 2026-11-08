import Link from "next/link";
import { Icon } from "@/components/grocery-art";
import { AnimatedGroceries } from "@/components/animated-groceries";

const howItWorks = [
  { icon: "pin", title: "Find your stores", copy: "Start with your location.", colour: "sage" },
  { icon: "receipt", title: "Compare your options", copy: "Check available prices.", colour: "apricot" },
  { icon: "bowl", title: "Plan your meals", copy: "Recipes within your budget.", colour: "butter" },
] as const;

export function Homepage() {
  return <div className="homepage">
    <section className="hero page-width" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Good food.<br /><span>Less fuss.</span></h1>
        <p className="hero-description">Groceries and meal plans that fit your budget.</p>
        <Link href="/plan" className="button button-primary">Start planning <Icon name="arrow" /></Link>
      </div>
      <AnimatedGroceries />
    </section>
    <section id="how-it-works" className="how-section page-width" aria-labelledby="how-title">
      <h2 id="how-title" className="sr-only">How it works</h2>
      <ol className="how-grid">{howItWorks.map(step => <li key={step.title}><Link href="/plan" className="how-card" aria-label={`Start planning: ${step.title}`}><span className={`how-icon colour-${step.colour}`}><Icon name={step.icon} /></span><div><h3>{step.title}</h3><p>{step.copy}</p></div></Link></li>)}</ol>
      <p className="coverage-note">Demo uses fictional stores and illustrative prices.</p>
    </section>
  </div>;
}
