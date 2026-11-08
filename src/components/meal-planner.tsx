"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { z } from "zod";
import { allergenSchema, currencyForCountry, dietSchema, locationInputSchema } from "@/contracts";
import type { Allergen, Country, Diet, LocationInput, StoreDiscoveryResult } from "@/contracts";
import { mealGenerationRequestSchema, mealPlanResultSchema } from "@/contracts/meal-plan";
import type { GeneratedMeal, MealGenerationRequest, MealPlanResult } from "@/contracts/meal-plan";
import { aggregateIngredients, retailerSearchLinks, shoppingListText } from "@/lib/meal-shopping";
import { Icon } from "@/components/grocery-art";
import { CountryFlag, FoodArt, PersonArt } from "@/components/preference-art";
import { StorePicker, GoogleStoreCredit } from "@/components/store-picker";
import { discoveryViewSchema, PlannerApiError, postPlanner } from "@/lib/planner-api";
import { safeExternalUrl } from "@/lib/planner";
import { storeSearchLink, storeShoppingOption, storeWebsiteLink, storeDirectionsLink } from "@/lib/store-shopping";
import { mealImageFor } from "@/lib/meal-images";

const dietLabels: Record<Diet, string> = { vegetarian: "Vegetarian", vegan: "Vegan", "gluten-free": "Gluten-free" };
const allergenLabels: Record<Allergen, string> = { milk: "Milk", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", "tree-nuts": "Tree nuts", peanuts: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame" };
const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: mealPlanResultSchema }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
]);
const quantity = (amount: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(amount);
const toggle = <T,>(items: T[], value: T) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];

export function MealPlanner() {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState<Country>("CA");
  const [postalCode, setPostalCode] = useState("");
  const [discovery, setDiscovery] = useState<StoreDiscoveryResult | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [regionalShopping, setRegionalShopping] = useState(false);
  const [storeBusy, setStoreBusy] = useState(false);
  const [storeError, setStoreError] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
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
  const storeRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const history = useRef<string[]>([]);
  const currency = currencyForCountry(country);
  const budgetLabel = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(budgetDollars);
  const meals = result?.meals ?? [];
  const items = useMemo(() => aggregateIngredients(result?.meals ?? []), [result]);
  const remaining = items.filter(item => checked[item.key] !== item.quantity);
  const ingredientUses = meals.reduce((sum, meal) => sum + meal.ingredients.length, 0);
  const combinedCount = Math.max(0, ingredientUses - items.length);
  const selectedStore = !regionalShopping ? discovery?.stores.find(store => store.id === selectedStoreId) ?? null : null;
  const selectedShop = selectedStore ? storeShoppingOption(selectedStore) : null;
  const selectedMapsUrl = safeExternalUrl(selectedStore?.googleMapsUri ?? "");

  useEffect(() => () => { request.current?.abort(); storeRequest.current?.abort(); }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }, [step]);

  function invalidate() {
    request.current?.abort(); request.current = null; setBusy(null); setResult(null); setError(""); setCopyStatus(""); setCopyFallback("");
  }
  function move(next: number) {
    request.current?.abort(); request.current = null; storeRequest.current?.abort(); storeRequest.current = null; setStoreBusy(false); setBusy(null); setError(""); setStep(next);
  }
  function clearLocation() {
    invalidate(); storeRequest.current?.abort(); storeRequest.current = null; setStoreBusy(false); setStoreError("");
    setDiscovery(null); setSelectedStoreId(null); setRegionalShopping(false); history.current = []; setChecked({});
  }
  async function findStores(location: LocationInput, radius = radiusKm) {
    storeRequest.current?.abort(); const controller = new AbortController(); storeRequest.current = controller;
    setStoreBusy(true); setStoreError(""); setDiscovery(null); setSelectedStoreId(null); setRegionalShopping(false);
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 25_000);
    try {
      const data = await postPlanner("/api/stores", { mode: "live", location, radiusKm: radius, discoveryScope: "all-grocers" }, discoveryViewSchema, controller.signal);
      if (controller.signal.aborted || storeRequest.current !== controller) return;
      if (data.mode !== "live" || data.location.country !== location.country || data.location.postalCode !== location.postalCode || data.location.currency !== currencyForCountry(location.country) || data.stores.some(store => store.source !== "google" || store.country !== location.country)) throw new PlannerApiError("invalid-response", "The stores didn’t match your location. Please try again.");
      setDiscovery(data);
    } catch (caught) {
      if (storeRequest.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setStoreError(timedOut ? "The store search took too long. Please try again." : caught instanceof PlannerApiError ? caught.message : "We couldn’t find your stores right now. Please try again.");
    } finally {
      window.clearTimeout(deadline); if (storeRequest.current === controller) { storeRequest.current = null; setStoreBusy(false); }
    }
  }
  function continueLocation(event: FormEvent) {
    event.preventDefault();
    const parsed = locationInputSchema.safeParse({ country, postalCode });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your location."); document.getElementById("meal-postal")?.focus(); return; }
    setPostalCode(parsed.data.postalCode); move(2);
    if (!discovery || discovery.location.country !== parsed.data.country || discovery.location.postalCode !== parsed.data.postalCode) void findStores(parsed.data);
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
    if (swapIndex === undefined) { setStep(4); setView("meals"); }
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
  function exportText() { return shoppingListText(meals, remaining, country, selectedStore); }
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
    <nav className="meal-progress" aria-label="Meal planning progress"><ol>{["Your location", "Your grocer", "Your table", "Meals & groceries"].map((label, index) => <li key={label}><button onClick={() => move(index + 1)} disabled={index + 1 > step || busy !== null || storeBusy} aria-current={step === index + 1 ? "step" : undefined}><span>{step > index + 1 ? <Icon name="check" /> : `0${index + 1}`}</span>{label}</button></li>)}</ol></nav>
    <div className="meal-topline">{step > 1 ? <button type="button" className="back-button" onClick={() => move(step - 1)}>Back</button> : <span className="meal-kicker">A little planning. A lot less fuss.</span>}<span>{step} / 4</span></div>
    <section className={`meal-screen meal-screen-${step}`} aria-busy={busy !== null || storeBusy}>
      <header className="meal-screen-heading"><span className="meal-kicker">{step === 1 ? "Made for your neighbourhood" : step === 2 ? "A real shop, a useful list" : step === 3 ? "Good food, your way" : "From inspiration to your next shop"}</span><h1 ref={heading} tabIndex={-1}>{step === 1 ? "Where’s your kitchen?" : step === 2 ? "Choose your grocer." : step === 3 ? "Who’s at your table?" : result ? "Your week, made easier." : "Let’s make something good."}</h1></header>
      {step === 1 && <form className="meal-location" onSubmit={continueLocation} noValidate>
        <fieldset><legend className="sr-only">Choose your country</legend><div className="country-options">{(["CA", "US"] as const).map(value => <label className={`country-option ${country === value ? "is-selected" : ""}`} key={value}><input type="radio" name="meal-country" checked={country === value} onChange={() => { clearLocation(); setCountry(value); setPostalCode(""); }} /><CountryFlag country={value} /><span>{value === "CA" ? "Canada" : "United States"}<small>{currencyForCountry(value)}</small></span><span className="country-check" aria-hidden="true">{country === value && <Icon name="check" />}</span></label>)}</div></fieldset>
        <label className="field-label meal-postal-label" htmlFor="meal-postal">{country === "CA" ? "Postal code" : "ZIP code"}</label><input id="meal-postal" className="text-input postal-input" autoComplete="postal-code" value={postalCode} placeholder={country === "CA" ? "L2R 3A1" : "14201"} maxLength={16} aria-describedby="meal-location-help" aria-invalid={!!error} onChange={event => { clearLocation(); setPostalCode(event.target.value); }} />
        <p className="small-note" id="meal-location-help">Finds nearby grocers and sets your currency. Your location isn’t saved.</p>
        <div className="flow-actions"><button className="button button-primary" type="submit">Find nearby grocers <Icon name="arrow" /></button></div>
      </form>}
      {step === 2 && <StorePicker discovery={discovery} busy={storeBusy} error={storeError} selectedId={selectedStoreId} radiusKm={radiusKm}
        onSelect={id => { setSelectedStoreId(id); setRegionalShopping(false); setCopyStatus(""); setCopyFallback(""); }} onRadius={setRadiusKm}
        onSearch={() => void findStores({ country, postalCode })} onContinue={() => move(result ? 4 : 3)}
        onRegional={() => { setRegionalShopping(true); setSelectedStoreId(null); setCopyStatus(""); setCopyFallback(""); move(result ? 4 : 3); }} />}
      {step === 3 && <form className="meal-preferences" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <div className="meal-setup-grid"><section className="meal-control-card"><div className="meal-control-title"><label htmlFor="meal-household">Household size</label><output htmlFor="meal-household" aria-live="polite">{householdSize} {householdSize === 1 ? "person" : "people"}</output></div><div className="meal-people" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index} className={index < householdSize ? "is-present" : ""}><PersonArt index={index} /></span>)}</div><input id="meal-household" className="meal-range" type="range" min={1} max={8} step={1} value={householdSize} aria-valuetext={`${householdSize} ${householdSize === 1 ? "person" : "people"}`} style={{ "--range-progress": `${((householdSize - 1) / 7) * 100}%` } as CSSProperties} onChange={event => { invalidate(); setHouseholdSize(Number(event.target.value)); }} /><div className="range-labels" aria-hidden="true"><span>Just me</span><span>A full table</span></div></section>
          <section className="meal-control-card meal-budget-card"><div className="meal-control-title"><label htmlFor="meal-budget">Grocery budget</label><span className="currency-badge">{currency}</span></div><output className="meal-budget-amount" htmlFor="meal-budget" aria-live="polite">{budgetLabel}</output><input id="meal-budget" className="meal-range" type="range" min={10} max={300} step={5} value={budgetDollars} style={{ "--range-progress": `${((budgetDollars - 10) / 290) * 100}%` } as CSSProperties} aria-valuetext={`${budgetLabel} ${currency}`} onChange={event => { invalidate(); setBudgetDollars(Number(event.target.value)); }} /><div className="range-labels" aria-hidden="true"><span>$10</span><span>$300</span></div><p className="small-note">A planning guide. Store prices aren’t available.</p></section></div>
        <fieldset className="meal-diet-field"><legend>On the menu</legend><div className="meal-diet-options">{dietSchema.options.map(diet => <button type="button" className={`meal-diet-option ${diets.includes(diet) ? "is-selected" : ""}`} aria-pressed={diets.includes(diet)} key={diet} onClick={() => { invalidate(); setDiets(toggle(diets, diet)); }}><FoodArt name={diet} /><span>{dietLabels[diet]}</span><span className="meal-option-check" aria-hidden="true">{diets.includes(diet) ? <Icon name="check" /> : "+"}</span></button>)}<button type="button" className={`meal-diet-option ${highProtein ? "is-selected" : ""}`} aria-pressed={highProtein} onClick={() => { invalidate(); setHighProtein(!highProtein); }}><FoodArt name="protein" /><span>Extra protein<small>Prefer, if possible</small></span><span className="meal-option-check" aria-hidden="true">{highProtein ? <Icon name="check" /> : "+"}</span></button></div><p className="small-note">No selection? Anything goes.</p></fieldset>
        <details className="meal-allergens"><summary>Food allergies <span>{allergens.length ? `${allergens.length} excluded` : "Optional"}</span></summary><fieldset><legend className="sr-only">Exclude allergens from generated meals</legend><div className="meal-allergen-options">{allergenSchema.options.map(allergen => <button type="button" className={allergens.includes(allergen) ? "is-selected" : ""} key={allergen} aria-pressed={allergens.includes(allergen)} onClick={() => { invalidate(); setAllergens(toggle(allergens, allergen)); }}>{allergenLabels[allergen]} {allergens.includes(allergen) && <Icon name="check" />}</button>)}</div></fieldset><p className="small-note">AI recipes aren’t an allergy guarantee. Check ingredients and product labels.</p></details>
        <div className="meal-count-control"><label htmlFor="meal-count">How many meals?</label><select id="meal-count" value={mealCount} onChange={event => { invalidate(); setMealCount(Number(event.target.value)); }}>{Array.from({ length: 7 }, (_, index) => <option key={index} value={index + 1}>{index + 1} {index === 0 ? "meal" : "meals"}</option>)}</select><span>{mealCount * householdSize} total servings</span></div>
        <div className="flow-actions"><button className="button button-primary" type="submit" disabled={busy !== null}>Create my meals <Icon name="arrow" /></button></div>
      </form>}
      {error && <div className="meal-error" role="alert"><strong>{step === 4 ? "Your meals couldn’t be updated" : "A quick check"}</strong><p>{error}</p>{step === 4 && <button className="text-button" onClick={() => void generate()} disabled={busy !== null}>Try again</button>}</div>}
      {step === 4 && <>
        {busy !== null && <div className="meal-loading" role="status"><span className="meal-loading-bowl"><Icon name="bowl" /></span><div><strong>{typeof busy === "number" ? "Finding a fresh idea…" : "A fresh menu is on its way…"}</strong><p>Creating recipes for your table. The grocery list follows automatically.</p></div><button type="button" className="text-button" onClick={() => { request.current?.abort(); request.current = null; setBusy(null); if (!result) setStep(3); }}>Cancel</button></div>}
        {result && <>
          <div className="meal-selected-shop">
            <div><span className="meal-kicker">{selectedStore ? "Your chosen grocer" : "Your shopping region"}</span><h2>{selectedStore?.name ?? (country === "CA" ? "Canada · regional retailer searches" : "United States · regional retailer searches")}</h2>
              {selectedStore ? <p>{selectedStore.address}</p> : <p>Choose your branch and confirm availability on the retailer’s website.</p>}
              <p className="small-note">{selectedShop ? "Ingredient searches open the retailer’s website. Confirm branch, prices and pickup or delivery there." : selectedStore ? "Take this list to your chosen grocer. Online ingredient search isn’t connected for this store." : "Regional searches aren’t linked to a discovered nearby store."}</p>
            </div>
            <div className="meal-selected-shop-actions">{selectedStore && storeDirectionsLink(selectedStore) && <a className="button button-secondary" href={storeDirectionsLink(selectedStore)!} target="_blank" rel="noreferrer">Get directions ↗</a>}{selectedStore && storeWebsiteLink(selectedStore) && <a className="text-button" href={storeWebsiteLink(selectedStore)!.url} target="_blank" rel="noreferrer">Visit retailer website ↗</a>}{selectedMapsUrl && <a className="text-button" href={selectedMapsUrl} target="_blank" rel="noreferrer">View on Maps ↗</a>}<button className="text-button" type="button" onClick={() => move(2)}>Change shop</button></div>
            {selectedStore && discovery && <GoogleStoreCredit discovery={discovery} />}
          </div>
          <div className="meal-result-toolbar"><p>{meals.length} meals <span>·</span> {householdSize} {householdSize === 1 ? "person" : "people"} <span>·</span> {country === "CA" ? "Canada" : "United States"}</p><button className="text-button" type="button" disabled={busy !== null} onClick={() => void generate()}>↻ Regenerate meals</button></div>
          <div className="meal-view-tabs" role="tablist" aria-label="Plan view" onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "meals" : event.key === "End" ? "shopping" : view === "meals" ? "shopping" : "meals"; setView(next); document.getElementById(next === "meals" ? "meals-tab" : "shopping-tab")?.focus(); } }}><button id="meals-tab" role="tab" tabIndex={view === "meals" ? 0 : -1} aria-selected={view === "meals"} aria-controls="meal-cards-panel" onClick={() => setView("meals")}><Icon name="bowl" /> Your meals</button><button id="shopping-tab" role="tab" tabIndex={view === "shopping" ? 0 : -1} aria-selected={view === "shopping"} aria-controls="shopping-panel" onClick={() => setView("shopping")}><Icon name="list" /> Grocery list <span>{items.length}</span></button></div>
          <section id="meal-cards-panel" role="tabpanel" aria-labelledby="meals-tab" hidden={view !== "meals"}>
            <div className="generated-meal-grid">{meals.map((meal: GeneratedMeal, index: number) => { const image = mealImageFor(meal); return <article className={`generated-meal ${busy === index ? "is-swapping" : ""}`} key={`${meal.id}-${index}`}><div className="generated-meal-art"><span className="meal-card-number">Meal {index + 1}</span><Image className="meal-serving-image" src={image.src} alt={image.alt} width={720} height={480} sizes="(max-width: 560px) 90vw, (max-width: 800px) 44vw, 340px" /><span className="meal-art-caption">{image.label}</span></div><div className="generated-meal-content"><p className="meal-card-meta">{meal.prepMinutes} min <span>·</span> {meal.servings} servings <span>·</span> {meal.dietaryCategory === "omnivore" ? "Mixed menu" : meal.dietaryCategory}</p><h2>{meal.name}</h2><p className="meal-description">{meal.description}</p><details className="meal-recipe-details"><summary>Recipe & ingredients</summary><h3>Ingredients <span>for all {meal.servings} servings</span></h3><ul>{meal.ingredients.map((ingredient, ingredientIndex) => <li key={`${ingredient.id}-${ingredientIndex}`}><span>{ingredient.name}{ingredient.preparation !== "as-sold" && <small> · {ingredient.preparation}</small>}</span><strong>{quantity(ingredient.quantity)} {ingredient.unit}</strong></li>)}</ul><h3>Make it</h3><ol>{meal.instructions.map((instruction, instructionIndex) => <li key={instructionIndex}>{instruction}</li>)}</ol></details><button className="meal-swap" type="button" disabled={busy !== null} aria-label={`Swap ${meal.name}`} onClick={() => void generate(index)}>↻ Swap meal <Icon name="arrow" /></button></div></article>; })}</div>
            <div className="meal-list-invitation"><div><Icon name="basket" /><p><strong>{items.length} ingredients. One ready-to-use list.</strong><span>{combinedCount > 0 ? `${combinedCount} overlapping ingredient entries combined automatically.` : "Quantities are ready for your whole household."}</span></p></div><button className="button button-primary" type="button" onClick={() => { setView("shopping"); document.getElementById("shopping-tab")?.focus(); }}>Get my grocery list <Icon name="arrow" /></button></div>
          </section>
          <section id="shopping-panel" role="tabpanel" aria-labelledby="shopping-tab" hidden={view !== "shopping"}>
            <div className="meal-shopping-top"><div><h2>Your groceries, together.</h2><p>{remaining.length} of {items.length} ingredients still needed{combinedCount > 0 ? ` · ${combinedCount} entries combined` : ""}</p></div><div className="meal-export-actions"><button className="button button-secondary" type="button" onClick={() => void copyList()}>Copy remaining</button><button className="button button-primary" type="button" onClick={downloadList}>Download .txt</button></div></div>
            <p className="meal-shopping-note">Check off what you have. Different units or preparation states stay separate. Retailer links search products; prices, stock and checkout carts aren’t provided.</p>
            <div className="meal-shopping-list">{items.map(item => { const done = checked[item.key] === item.quantity; return <div className={`meal-shopping-row ${done ? "is-checked" : ""}`} key={item.key}><label><input type="checkbox" checked={done} onChange={() => { setChecked(previous => ({ ...previous, [item.key]: done ? -1 : item.quantity })); setCopyStatus(""); setCopyFallback(""); }} /><span className="meal-shopping-name"><strong>{item.name}</strong><small>{item.preparation !== "as-sold" ? `${item.preparation} · ` : ""}{item.mealIds.length > 1 ? `Used in ${item.mealIds.length} meals` : "For your recipe"}</small></span><span className="meal-shopping-quantity">{quantity(item.quantity)} {item.unit}</span></label>{(selectedShop || regionalShopping) && <details className="meal-retailer-links"><summary>Shop ingredient ↗</summary><div>{(selectedStore ? [storeSearchLink(selectedStore, item.name)].filter((link): link is { name: string; url: string } => link !== null) : retailerSearchLinks(country, item.name)).map(link => <a key={link.name} href={link.url} target="_blank" rel="noreferrer">Search at {link.name} ↗</a>)}</div></details>}</div>; })}</div>
            {remaining.length === 0 && <div className="meal-all-done" role="status"><Icon name="check" /> Everything’s checked off. Happy cooking!</div>}
            <p className="meal-copy-status" role="status">{copyStatus}</p>{copyFallback && <div className="meal-copy-fallback"><label htmlFor="meal-copy-text">Your remaining grocery list</label><textarea id="meal-copy-text" readOnly value={copyFallback} onFocus={event => event.target.select()} /></div>}
            {selectedStore && !selectedShop && <div className="meal-in-person-note"><Icon name="list" /><p>Your list is ready to take to {selectedStore.name}. Use copy or download above, or <button type="button" className="text-button" onClick={() => move(2)}>change your shopping option</button>.</p></div>}
          </section>
          <div className="meal-result-disclosure"><p>Recipes generated with Gemini. Budget {budgetLabel} {currency} is guidance, not a verified basket total. Check ingredients, cooking instructions and product labels.</p>{result.notices.length > 0 && <details><summary>About this plan</summary><ul>{result.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul></details>}</div>
        </>}
      </>}
    </section>
  </div>;
}
