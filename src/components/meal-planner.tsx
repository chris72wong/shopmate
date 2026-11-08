"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { z } from "zod";
import { allergenSchema, currencyForCountry, dietSchema, locationInputSchema } from "@/contracts";
import type { Allergen, Country, Diet } from "@/contracts";
import { mealGenerationRequestSchema, mealPlanResultSchema } from "@/contracts/meal-plan";
import type { GeneratedMeal, MealGenerationRequest, MealPlanResult } from "@/contracts/meal-plan";
import { aggregateIngredients, retailerSearchLinks, shoppingListText } from "@/lib/meal-shopping";
import { Icon, MealArt } from "@/components/grocery-art";
import type { MealArtKind } from "@/components/grocery-art";
import { CountryFlag, FoodArt, PersonArt } from "@/components/preference-art";
import { NearbyGrocers } from "@/components/nearby-grocers";

const dietLabels: Record<Diet, string> = { vegetarian: "Vegetarian", vegan: "Vegan", "gluten-free": "Gluten-free" };
const allergenLabels: Record<Allergen, string> = { milk: "Milk", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", "tree-nuts": "Tree nuts", peanuts: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame" };
const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: mealPlanResultSchema }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
const quantity = (amount: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(amount);
const artKinds: MealArtKind[] = ["bowl", "skillet", "soup", "pasta", "breakfast"];
const toggle = <T,>(items: T[], value: T) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];

export function MealPlanner() {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState<Country>("CA");
  const [postalCode, setPostalCode] = useState("");
  const [householdSize, setHouseholdSize] = useState(2);
  const [budgetDollars, setBudgetDollars] = useState(100);
  const [mealCount, setMealCount] = useState(3);
  const [diets, setDiets] = useState<Diet[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [highProtein, setHighProtein] = useState(false);
  const [result, setResult] = useState<MealPlanResult | null>(null);
  const [busy, setBusy] = useState<"all" | number | null>(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Record<string, number>>({});
  const [copyStatus, setCopyStatus] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [view, setView] = useState<"meals" | "shopping">("meals");
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const history = useRef<string[]>([]);
  const currency = currencyForCountry(country);
  const budgetLabel = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(budgetDollars);
  const meals = result?.meals ?? [];
  const items = useMemo(() => aggregateIngredients(result?.meals ?? []), [result]);
  const remaining = items.filter(item => checked[item.key] !== item.quantity);
  const ingredientUses = meals.reduce((sum, meal) => sum + meal.ingredients.length, 0);
  const combinedCount = Math.max(0, ingredientUses - items.length);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }, [step]);

  function invalidate() {
    request.current?.abort(); request.current = null; setBusy(null); setResult(null); setError(""); setCopyStatus(""); setCopyFallback("");
  }
  function move(next: number) {
    request.current?.abort(); request.current = null; setBusy(null); setError(""); setStep(next);
  }
  function continueLocation(event: FormEvent) {
    event.preventDefault();
    const parsed = locationInputSchema.safeParse({ country, postalCode });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your location."); document.getElementById("meal-postal")?.focus(); return; }
    setPostalCode(parsed.data.postalCode); move(2);
  }
  function buildRequest(count = mealCount, reuseIngredients = false): MealGenerationRequest | null {
    const parsed = mealGenerationRequestSchema.safeParse({ location: { country, postalCode }, householdSize, mealCount: count,
      budget: { amountCents: budgetDollars * 100, currency }, dietaryRestrictions: diets, excludedAllergens: allergens,
      highProtein, avoidMealNames: history.current.slice(-30),
      ingredientConventions: reuseIngredients ? items.map(item => ({ id: item.ingredientId, name: item.name, unit: item.unit, preparation: item.preparation, category: item.category })).slice(0, 175) : [] });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your preferences."); return null; }
    return parsed.data;
  }
  async function generate(swapIndex?: number) {
    if (busy !== null) return;
    const payload = buildRequest(swapIndex === undefined ? mealCount : 1, swapIndex !== undefined);
    if (!payload) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setError(""); setBusy(swapIndex ?? "all"); setCopyStatus(""); setCopyFallback("");
    if (swapIndex === undefined) { setStep(3); setView("meals"); }
    const deadline = window.setTimeout(() => controller.abort("timeout"), 75_000);
    try {
      const response = await fetch("/api/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const parsed = responseSchema.safeParse(await response.json());
      if (request.current !== controller || controller.signal.aborted) return;
      if (!parsed.success) throw new Error("The meal service returned an unreadable response. Please try again.");
      if (!parsed.data.ok) throw new Error(parsed.data.error.message);
      if (!response.ok) throw new Error("Your meals couldn’t be generated. Please try again.");
      const next = parsed.data.data;
      if (next.meals.length !== payload.mealCount || next.meals.some(meal => meal.servings !== householdSize)) throw new Error("The meals didn’t match your household. Please try again.");
      history.current = [...history.current, ...next.meals.map(meal => meal.name)].slice(-30);
      // Slot identity keeps usage counts correct even when a one-meal response
      // reuses a provider recipe ID from another slot.
      if (swapIndex === undefined) { setResult({ ...next, meals: next.meals.map((meal, index) => ({ ...meal, id: `meal-slot-${index + 1}` })) }); setChecked({}); }
      else setResult(previous => previous ? { ...next, meals: previous.meals.map((meal, index) => index === swapIndex ? { ...next.meals[0]!, id: `meal-slot-${index + 1}` } : meal) } : next);
    } catch (caught) {
      if (request.current !== controller) return;
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setError(controller.signal.aborted ? "Meal generation took too long. Please try again." : caught instanceof Error ? caught.message : "We couldn’t reach the meal service. Please try again.");
    } finally {
      window.clearTimeout(deadline);
      if (request.current === controller) { request.current = null; setBusy(null); }
    }
  }
  function exportText() { return shoppingListText(meals, remaining, country); }
  async function copyList() {
    const text = exportText();
    try { await navigator.clipboard.writeText(text); setCopyStatus("Remaining groceries copied."); setCopyFallback(""); }
    catch { setCopyFallback(text); setCopyStatus("Select and copy your list below."); }
  }
  function downloadList() {
    const url = URL.createObjectURL(new Blob([exportText()], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `shopmate-groceries-${country.toLowerCase()}.txt`;
    document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCopyStatus("Your shopping list downloaded.");
  }

  return <div className="meal-app app-width">
    <nav className="meal-progress" aria-label="Meal planning progress"><ol>{["Your location", "Your table", "Meals & groceries"].map((label, index) => <li key={label}><button onClick={() => move(index + 1)} disabled={index + 1 > step || busy !== null} aria-current={step === index + 1 ? "step" : undefined}><span>{step > index + 1 ? <Icon name="check" /> : `0${index + 1}`}</span>{label}</button></li>)}</ol></nav>
    <div className="meal-topline">{step > 1 ? <button type="button" className="back-button" onClick={() => move(step - 1)}>Back</button> : <span className="meal-kicker">A little planning. A lot less fuss.</span>}<span>{step} / 3</span></div>
    <section className={`meal-screen meal-screen-${step}`} aria-busy={busy !== null}>
      <header className="meal-screen-heading"><span className="meal-kicker">{step === 1 ? "Made for your neighbourhood" : step === 2 ? "Good food, your way" : "From inspiration to your next shop"}</span><h1 ref={heading} tabIndex={-1}>{step === 1 ? "Where’s your kitchen?" : step === 2 ? "Who’s at your table?" : result ? "Your week, made easier." : "Let’s make something good."}</h1></header>
      {step === 1 && <form className="meal-location" onSubmit={continueLocation} noValidate>
        <fieldset><legend className="sr-only">Choose your country</legend><div className="country-options">{(["CA", "US"] as const).map(value => <label className={`country-option ${country === value ? "is-selected" : ""}`} key={value}><input type="radio" name="meal-country" checked={country === value} onChange={() => { invalidate(); setCountry(value); setPostalCode(""); }} /><CountryFlag country={value} /><span>{value === "CA" ? "Canada" : "United States"}<small>{currencyForCountry(value)}</small></span><span className="country-check" aria-hidden="true">{country === value && <Icon name="check" />}</span></label>)}</div></fieldset>
        <label className="field-label meal-postal-label" htmlFor="meal-postal">{country === "CA" ? "Postal code" : "ZIP code"}</label><input id="meal-postal" className="text-input postal-input" autoComplete="postal-code" value={postalCode} placeholder={country === "CA" ? "L2R 3A1" : "14201"} maxLength={16} aria-describedby="meal-location-help" aria-invalid={!!error} onChange={event => { invalidate(); setPostalCode(event.target.value); }} />
        <p className="small-note" id="meal-location-help">Sets your shopping region and currency. Your location isn’t saved.</p>
        <div className="flow-actions"><button className="button button-primary" type="submit">Make it yours <Icon name="arrow" /></button></div>
      </form>}
      {step === 2 && <form className="meal-preferences" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <div className="meal-setup-grid"><section className="meal-control-card"><div className="meal-control-title"><label htmlFor="meal-household">Household size</label><output htmlFor="meal-household" aria-live="polite">{householdSize} {householdSize === 1 ? "person" : "people"}</output></div><div className="meal-people" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index} className={index < householdSize ? "is-present" : ""}><PersonArt index={index} /></span>)}</div><input id="meal-household" className="meal-range" type="range" min={1} max={8} step={1} value={householdSize} aria-valuetext={`${householdSize} ${householdSize === 1 ? "person" : "people"}`} style={{ "--range-progress": `${((householdSize - 1) / 7) * 100}%` } as CSSProperties} onChange={event => { invalidate(); setHouseholdSize(Number(event.target.value)); }} /><div className="range-labels" aria-hidden="true"><span>Just me</span><span>A full table</span></div></section>
          <section className="meal-control-card meal-budget-card"><div className="meal-control-title"><label htmlFor="meal-budget">Grocery budget</label><span className="currency-badge">{currency}</span></div><output className="meal-budget-amount" htmlFor="meal-budget" aria-live="polite">{budgetLabel}</output><input id="meal-budget" className="meal-range" type="range" min={10} max={300} step={5} value={budgetDollars} style={{ "--range-progress": `${((budgetDollars - 10) / 290) * 100}%` } as CSSProperties} aria-valuetext={`${budgetLabel} ${currency}`} onChange={event => { invalidate(); setBudgetDollars(Number(event.target.value)); }} /><div className="range-labels" aria-hidden="true"><span>$10</span><span>$300</span></div><p className="small-note">A planning guide. Store prices aren’t available.</p></section></div>
        <fieldset className="meal-diet-field"><legend>On the menu</legend><div className="meal-diet-options">{dietSchema.options.map(diet => <button type="button" className={`meal-diet-option ${diets.includes(diet) ? "is-selected" : ""}`} aria-pressed={diets.includes(diet)} key={diet} onClick={() => { invalidate(); setDiets(toggle(diets, diet)); }}><FoodArt name={diet} /><span>{dietLabels[diet]}</span><span className="meal-option-check" aria-hidden="true">{diets.includes(diet) ? <Icon name="check" /> : "+"}</span></button>)}<button type="button" className={`meal-diet-option ${highProtein ? "is-selected" : ""}`} aria-pressed={highProtein} onClick={() => { invalidate(); setHighProtein(!highProtein); }}><FoodArt name="protein" /><span>Extra protein<small>Prefer, if possible</small></span><span className="meal-option-check" aria-hidden="true">{highProtein ? <Icon name="check" /> : "+"}</span></button></div><p className="small-note">No selection? Anything goes.</p></fieldset>
        <details className="meal-allergens"><summary>Food allergies <span>{allergens.length ? `${allergens.length} excluded` : "Optional"}</span></summary><fieldset><legend className="sr-only">Exclude allergens from generated meals</legend><div className="meal-allergen-options">{allergenSchema.options.map(allergen => <button type="button" className={allergens.includes(allergen) ? "is-selected" : ""} key={allergen} aria-pressed={allergens.includes(allergen)} onClick={() => { invalidate(); setAllergens(toggle(allergens, allergen)); }}>{allergenLabels[allergen]} {allergens.includes(allergen) && <Icon name="check" />}</button>)}</div></fieldset><p className="small-note">AI recipes aren’t an allergy guarantee. Check ingredients and product labels.</p></details>
        <div className="meal-count-control"><label htmlFor="meal-count">How many meals?</label><select id="meal-count" value={mealCount} onChange={event => { invalidate(); setMealCount(Number(event.target.value)); }}>{Array.from({ length: 7 }, (_, index) => <option key={index} value={index + 1}>{index + 1} {index === 0 ? "meal" : "meals"}</option>)}</select><span>{mealCount * householdSize} total servings</span></div>
        <div className="flow-actions"><button className="button button-primary" type="submit" disabled={busy !== null}>Create my meals <Icon name="arrow" /></button></div>
      </form>}
      {error && <div className="meal-error" role="alert"><strong>{step === 3 ? "Your meals couldn’t be updated" : "A quick check"}</strong><p>{error}</p>{step === 3 && <button className="text-button" onClick={() => void generate()} disabled={busy !== null}>Try again</button>}</div>}
      {step === 3 && <>
        {busy !== null && <div className="meal-loading" role="status"><span className="meal-loading-bowl"><Icon name="bowl" /></span><div><strong>{typeof busy === "number" ? "Finding a fresh idea…" : "A fresh menu is on its way…"}</strong><p>Creating recipes for your table. The grocery list follows automatically.</p></div><button type="button" className="text-button" onClick={() => { request.current?.abort(); request.current = null; setBusy(null); if (!result) setStep(2); }}>Cancel</button></div>}
        {result && <>
          <div className="meal-result-toolbar"><p>{meals.length} meals <span>·</span> {householdSize} {householdSize === 1 ? "person" : "people"} <span>·</span> {country === "CA" ? "Canada" : "United States"}</p><button className="text-button" type="button" disabled={busy !== null} onClick={() => void generate()}>↻ Regenerate meals</button></div>
          <div className="meal-view-tabs" role="tablist" aria-label="Plan view" onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "meals" : event.key === "End" ? "shopping" : view === "meals" ? "shopping" : "meals"; setView(next); document.getElementById(next === "meals" ? "meals-tab" : "shopping-tab")?.focus(); } }}><button id="meals-tab" role="tab" tabIndex={view === "meals" ? 0 : -1} aria-selected={view === "meals"} aria-controls="meal-cards-panel" onClick={() => setView("meals")}><Icon name="bowl" /> Your meals</button><button id="shopping-tab" role="tab" tabIndex={view === "shopping" ? 0 : -1} aria-selected={view === "shopping"} aria-controls="shopping-panel" onClick={() => setView("shopping")}><Icon name="list" /> Grocery list <span>{items.length}</span></button></div>
          <section id="meal-cards-panel" role="tabpanel" aria-labelledby="meals-tab" hidden={view !== "meals"}>
            <div className="generated-meal-grid">{meals.map((meal: GeneratedMeal, index: number) => <article className={`generated-meal ${busy === index ? "is-swapping" : ""}`} key={`${meal.id}-${index}`}><div className="generated-meal-art"><span className="meal-card-number">Meal {index + 1}</span><MealArt kind={artKinds[index % artKinds.length]} /><span className="meal-art-caption">Illustration</span></div><div className="generated-meal-content"><p className="meal-card-meta">{meal.prepMinutes} min <span>·</span> {meal.servings} servings <span>·</span> {meal.dietaryCategory === "omnivore" ? "Mixed menu" : meal.dietaryCategory}</p><h2>{meal.name}</h2><p className="meal-description">{meal.description}</p><details className="meal-recipe-details"><summary>Recipe & ingredients</summary><h3>Ingredients <span>for all {meal.servings} servings</span></h3><ul>{meal.ingredients.map((ingredient, ingredientIndex) => <li key={`${ingredient.id}-${ingredientIndex}`}><span>{ingredient.name}{ingredient.preparation !== "as-sold" && <small> · {ingredient.preparation}</small>}</span><strong>{quantity(ingredient.quantity)} {ingredient.unit}</strong></li>)}</ul><h3>Make it</h3><ol>{meal.instructions.map((instruction, instructionIndex) => <li key={instructionIndex}>{instruction}</li>)}</ol></details><button className="meal-swap" type="button" disabled={busy !== null} aria-label={`Swap ${meal.name}`} onClick={() => void generate(index)}>↻ Swap meal <Icon name="arrow" /></button></div></article>)}</div>
            <div className="meal-list-invitation"><div><Icon name="basket" /><p><strong>{items.length} ingredients. One ready-to-use list.</strong><span>{combinedCount > 0 ? `${combinedCount} overlapping ingredient entries combined automatically.` : "Quantities are ready for your whole household."}</span></p></div><button className="button button-primary" type="button" onClick={() => { setView("shopping"); document.getElementById("shopping-tab")?.focus(); }}>Get my grocery list <Icon name="arrow" /></button></div>
          </section>
          <section id="shopping-panel" role="tabpanel" aria-labelledby="shopping-tab" hidden={view !== "shopping"}>
            <div className="meal-shopping-top"><div><h2>Your groceries, together.</h2><p>{remaining.length} of {items.length} ingredients still needed{combinedCount > 0 ? ` · ${combinedCount} entries combined` : ""}</p></div><div className="meal-export-actions"><button className="button button-secondary" type="button" onClick={() => void copyList()}>Copy remaining</button><button className="button button-primary" type="button" onClick={downloadList}>Download .txt</button></div></div>
            <p className="meal-shopping-note">Check off what you have. Different units or preparation states stay separate. Retailer links search products; prices, stock and checkout carts aren’t provided.</p>
            <div className="meal-shopping-list">{items.map(item => { const done = checked[item.key] === item.quantity; return <div className={`meal-shopping-row ${done ? "is-checked" : ""}`} key={item.key}><label><input type="checkbox" checked={done} onChange={() => { setChecked(previous => ({ ...previous, [item.key]: done ? -1 : item.quantity })); setCopyStatus(""); setCopyFallback(""); }} /><span className="meal-shopping-name"><strong>{item.name}</strong><small>{item.preparation !== "as-sold" ? `${item.preparation} · ` : ""}{item.mealIds.length > 1 ? `Used in ${item.mealIds.length} meals` : "For your recipe"}</small></span><span className="meal-shopping-quantity">{quantity(item.quantity)} {item.unit}</span></label><details className="meal-retailer-links"><summary>Shop ingredient ↗</summary><div>{retailerSearchLinks(country, item.name).map(link => <a key={link.name} href={link.url} target="_blank" rel="noreferrer">Search at {link.name} ↗</a>)}</div></details></div>; })}</div>
            {remaining.length === 0 && <div className="meal-all-done" role="status"><Icon name="check" /> Everything’s checked off. Happy cooking!</div>}
            <p className="meal-copy-status" role="status">{copyStatus}</p>{copyFallback && <div className="meal-copy-fallback"><label htmlFor="meal-copy-text">Your remaining grocery list</label><textarea id="meal-copy-text" readOnly value={copyFallback} onFocus={event => event.target.select()} /></div>}
            <NearbyGrocers key={`${country}:${postalCode}`} location={{ country, postalCode }} />
          </section>
          <div className="meal-result-disclosure"><p>Recipes generated with Gemini. Budget {budgetLabel} {currency} is guidance, not a verified basket total. Check ingredients, cooking instructions and product labels.</p>{result.notices.length > 0 && <details><summary>About this plan</summary><ul>{result.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></details>}</div>
        </>}
      </>}
    </section>
  </div>;
}
