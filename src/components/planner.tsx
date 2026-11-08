"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Country, DataMode, Ingredient, Preferences, ProductPackage, Recipe } from "@/contracts";
import { allergenSchema, currencyForCountry, dietSchema, optimizationRequestV2Schema, storeDiscoveryRequestSchema } from "@/contracts";
import { budgetCents, initialPlanner, plannerReducer, safeExternalUrl, toggleValue } from "@/lib/planner";
import { discoveryV2ViewSchema, optimizationV2ViewSchema, pricingViewSchema, pricingMatchesRequest, planV2MatchesRequest, PlannerApiError, postPlanner } from "@/lib/planner-api";
import { formatMoney } from "@/lib/format";

import { PlanResults } from "./plan-results";
import { Counter, LoadingState, Notices, SectionHeading } from "./planner-ui";
import { GroceryTote, Icon, MealArt } from "@/components/grocery-art";

interface PlannerProps { catalogVersion: string; recipes: Recipe[]; ingredients: Ingredient[]; products: ProductPackage[]; initialMode?: DataMode; initialCountry?: Country }
const steps = ["Location", "Stores", "Preferences", "Plan", "Results"];
const labels = { "gluten-free": "Gluten-free", "tree-nuts": "Tree nuts", milk: "Milk", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", peanuts: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame", vegetarian: "Vegetarian", vegan: "Vegan" };

export function Planner({ catalogVersion, recipes, ingredients, products, initialMode = "live", initialCountry }: PlannerProps) {
  const [state, dispatch] = useReducer(plannerReducer, initialPlanner(initialMode, initialCountry ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlannerApiError | null>(null);
  const [validation, setValidation] = useState("");
  const [budget, setBudget] = useState("80.00");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const request = useRef<AbortController | null>(null);
  const previousStep = useRef(state.step);
  const { country, mode, preferences, discovery, step } = state;
  const currency = currencyForCountry(country ?? "CA");

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (previousStep.current !== step) {
      document.getElementById("screen-title")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
      previousStep.current = step;
    }
  }, [step]);
  useEffect(() => {
    if (error || state.result) document.getElementById("screen-title")?.focus({ preventScroll: true });
  }, [error, state.result]);
  function cancelRequest() { request.current?.abort(); request.current = null; setBusy(false); setError(null); setValidation(""); }
  function go(next: number) { cancelRequest(); dispatch({ type: "step", step: next }); }
  function changePreferences(patch: Partial<Preferences>) { dispatch({ type: "preferences", preferences: { ...preferences, ...patch } }); setError(null); setValidation(""); }
  async function discover(event?: FormEvent) {
    event?.preventDefault();
    if (!country) { setValidation("Choose Canada or the United States to continue."); return; }
    const payload = storeDiscoveryRequestSchema.safeParse({ mode, location: { country, postalCode: mode === "demo" ? (country === "CA" ? "M5V 2T6" : "02108") : state.postalCode }, radiusKm: state.radiusKm });
    if (!payload.success) {
      setValidation(!state.postalCode.trim() ? (country === "CA" ? "Enter a postal code." : "Enter a ZIP code.") : country === "CA" ? "Use a postal code like M5V 2T6." : "Use 5 digits or ZIP+4, like 02108.");
      document.getElementById("postal-code")?.focus(); return;
    }
    cancelRequest(); const controller = new AbortController(); request.current = controller;
    setBusy(true); dispatch({ type: "step", step: 2 });
    // Location changes already clear stores. A retry also discards expired provider content.
    dispatch({ type: "location", postalCode: state.postalCode, radiusKm: state.radiusKm });
    try {
      const data = await postPlanner("/api/v2/stores", payload.data, discoveryV2ViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      if (data.mode !== mode || data.location.country !== country || data.location.currency !== currency || data.stores.some(store => store.country !== country || store.source !== (mode === "demo" ? "demo" : "google"))) throw new PlannerApiError("invalid-response", "The store response didn’t match your search. Please try again.");
      dispatch({ type: "discovery", data });
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof PlannerApiError ? caught : new PlannerApiError("network", "We couldn’t find your stores. Please try again.")); }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  async function checkPricing() {
    if (!country || !state.storeIds.length) return;
    cancelRequest(); const controller = new AbortController(); request.current = controller; setBusy(true);
    const selection = { mode, country, storeIds: state.storeIds, catalogVersion };
    try {
      const data = await postPlanner("/api/v2/pricing", selection, pricingViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      if (!pricingMatchesRequest(data, selection)) throw new PlannerApiError("invalid-response", "Prices didn’t match your selected stores. Please try again.");
      dispatch({ type: "pricing", data }); dispatch({ type: "step", step: 3 });
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof PlannerApiError ? caught : new PlannerApiError("network", "Prices couldn’t be checked. Please try again.")); }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  function validatePreferences(nextStep: number) {
    const cents = budgetCents(budget);
    if (cents === null) { setValidation(`Use ${currency} 0.01–10,000, with up to 2 decimals.`); document.getElementById("budget")?.focus(); return; }
    changePreferences({ weeklyBudget: { amountCents: cents, currency } }); go(nextStep);
  }
  async function optimize() {
    const parsed = optimizationRequestV2Schema.safeParse({ catalogVersion, mode, country, storeIds: state.storeIds, preferences });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check your preferences."); return; }
    cancelRequest(); const controller = new AbortController(); request.current = controller;
    dispatch({ type: "clear-result" }); dispatch({ type: "step", step: 5 }); setBusy(true);
    try {
      const data = await postPlanner("/api/v2/optimize", parsed.data, optimizationV2ViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      if (!planV2MatchesRequest(data, parsed.data)) throw new PlannerApiError("invalid-response", "The plan didn’t match your selections and budget. Please try again.");
      dispatch({ type: "result", result: data });
    } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof PlannerApiError ? caught : new PlannerApiError("network", "Your plan couldn’t be loaded. Please try again.")); }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  const unavailable = error?.code === "not-implemented" || error?.code === "provider-not-configured";
  const errorPanel = error && (
    <section className="error-state" role="alert">
      <SectionHeading title={unavailable ? (step === 2 ? (discovery ? "Pricing unavailable" : "Search unavailable") : "Planning unavailable") : error.code === "not-found" ? "Location not found" : "Please try again"} />
      <p>{unavailable ? error.message : error.code === "rate-limited" ? "Too many requests. Try again shortly." : error.message}</p>
      {error.details.length > 0 && <ul>{error.details.map((item, index) => <li key={index}>{item.message}</li>)}</ul>}
      <div className="error-actions">
        <button className="button button-primary" onClick={() => go(step === 2 ? (discovery ? 2 : 1) : 4)}>{step === 2 ? (discovery ? "Edit stores" : "Edit location") : "Edit plan"}</button>
        <button className="text-button" onClick={() => step === 2 ? (discovery ? checkPricing() : discover()) : optimize()}>Try again</button>
      </div>
      {step === 2 && mode === "live" && <Link className="sample-link" href={`/demo?country=${country}`}>Explore the separate sample experience <span aria-hidden="true">↗</span></Link>}
    </section>
  );

  return (
    <div className="planner app-width">
      <aside className="planner-aside">
        <p className="eyebrow">A FRESH WAY TO PLAN</p>
        <h2>A little plan.<br />A lot to love.</h2>
        <p className="aside-description">Your stores, your budget, your meals. Let’s bring it all together.</p>
        <nav className="journey-nav" aria-label="Planning progress">
          <ol>{steps.map((label, index) => {
            const number = index + 1;
            const reachable = number < step && (number < 3 || state.storeIds.length > 0);
            return <li key={label} className={number <= step ? "reached" : ""}><button aria-label={`${number}. ${label}`} aria-current={number === step ? "step" : undefined} disabled={!reachable} onClick={() => go(number)}><span className="journey-number">{number < step ? <Icon name="check" /> : `0${number}`}</span><span className="journey-label">{label}</span></button></li>;
          })}</ol>
        </nav>
        <GroceryTote className="aside-art" /><p className="aside-caption handwritten">good things are in the bag.</p>
      </aside>
      <div className="planner-workspace">
      <div className="flow-topline">
        {step > 1 ? <button className="back-button" onClick={() => go(step - 1)} aria-label="Back to previous step">Back</button> : <span><Icon name="spark" /> Your next good meal starts here</span>}
        <span className="step-count">STEP 0{step} <span>/ 05</span></span>
      </div>
      {mode === "demo" && <div className="sample-notice"><span><Icon name="spark" /> Demo mode · fictional stores · illustrative prices · {currency}</span><Link href="/plan">Exit demo</Link></div>}
      <div className="planner-main" key={step} aria-busy={busy}>
        {step === 1 && <>
          <div className="intro-tag"><Icon name="pin" /> {mode === "demo" ? "A taste of ShopMate" : "First, your neighbourhood"}</div>
          <SectionHeading title="Where do you shop?">{mode === "demo" ? "Choose a country to explore fictional stores and sample meal plans. No location needed." : "Find grocery stores around you. Then we’ll make a plan that fits your life."}</SectionHeading>
          <form onSubmit={discover} noValidate>
            <fieldset className="country-field">
              <legend className="sr-only">Choose your country</legend>
              <div className="country-options">
                {([ ["CA", "Canada", "CAD"], ["US", "United States", "USD"] ] as const).map(([value, label, code]) => (
                  <label className={`country-option ${country === value ? "is-selected" : ""}`} key={value}>
                    <input type="radio" name="country" value={value} checked={country === value} onChange={() => { cancelRequest(); dispatch({ type: "country", country: value }); }} />
                    <span className="country-symbol" aria-hidden="true">{value === "CA" ? "✳" : "★"}</span><span>{label}<small>{code}</small></span><span className="country-check" aria-hidden="true">{country === value && <Icon name="check" />}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {country && mode === "live" && <div className="location-fields">
              <label className="field-label" htmlFor="postal-code">{country === "CA" ? "Postal code" : "ZIP code"}</label>
              <input className="text-input postal-input" id="postal-code" autoComplete="postal-code" value={state.postalCode} maxLength={16} placeholder={country === "CA" ? "M5V 2T6" : "02108"} aria-invalid={!!validation} aria-describedby={validation ? "location-error location-help" : "location-help"} onChange={event => { cancelRequest(); dispatch({ type: "location", postalCode: event.target.value, radiusKm: state.radiusKm }); }} />
              <p className="small-note" id="location-help">Used for this search. Your location isn’t saved in your browser.</p>
              <div className="radius-row"><label htmlFor="radius">Search radius</label><select id="radius" value={state.radiusKm} onChange={event => { cancelRequest(); dispatch({ type: "location", postalCode: state.postalCode, radiusKm: Number(event.target.value) }); }}>{[1, 5, 10, 25, 50].map(radius => <option key={radius} value={radius}>{radius} km</option>)}</select></div>
            </div>}
            <p className="field-error" id="location-error" role={validation ? "alert" : undefined}>{validation}</p>
            <div className="flow-actions"><button type="submit" className="button button-primary" disabled={!country}>{mode === "demo" ? "View sample stores" : "Find stores"}<Icon name="arrow" /></button></div>
          </form>
          {mode === "live" && <><Link className="sample-link" href="/demo">Just looking? Try the sample experience <span aria-hidden="true">↗</span></Link><p className="location-coverage small-note">Live prices depend on verified store coverage. Sample prices are always labeled.</p></>}
        </>}

        {step === 2 && <>
          {!error && <SectionHeading title="Choose your stores">{!busy && discovery?.stores.length ? "Pick up to 3 stores. We’ll compare one complete shopping basket at each." : undefined}</SectionHeading>}
          {busy && <LoadingState title={discovery ? "Checking available prices…" : "Finding your grocery spots…"} description={discovery ? "Looking for ingredient coverage at your selected stores." : "Gathering stores for your search. Good things are on the way."} />}
          {errorPanel}
          {!busy && !error && discovery && <>
            <p className="data-note">{mode === "demo" ? "Illustrative prices · fictional stores" : "Real stores · prices require verified branch coverage"}</p>
            <div className="store-list">{discovery.stores.map(store => (
              <article className={`store-row ${state.storeIds.includes(store.id) ? "is-selected" : ""}`} key={store.id}>
                <label className="store-choice">
                  <span className="store-monogram" aria-hidden="true"><Icon name="basket" /></span>
                  <span><strong>{store.name}</strong><span className="store-address">{store.address}</span>
                    {(store.pricing.status === "unavailable" || store.source === "google") && <span className="store-meta">{store.pricing.status === "unavailable" ? "Pricing unavailable" : store.pricing.status === "verified-capable" ? `Verified pricing supported · ${store.pricing.channel}` : "Illustrative prices"}{store.source === "google" && ` · ${(store.distanceMeters / 1000).toFixed(1)} km straight-line`}</span>}
                  </span>
                  <input type="checkbox" aria-label={`Compare ${store.name}`} checked={state.storeIds.includes(store.id)} disabled={!state.storeIds.includes(store.id) && state.storeIds.length >= 3} onChange={() => dispatch({ type: "store", id: store.id })} />
                </label>
                {store.googleMapsUri && safeExternalUrl(store.googleMapsUri) && <a className="map-link" target="_blank" rel="noreferrer" href={safeExternalUrl(store.googleMapsUri)}>Google Maps</a>}
              </article>
            ))}</div>
            {discovery.mode === "live" && <div className="google-attribution"><Image src="/google-maps-logo.svg" alt="Google Maps" width={100} height={18} unoptimized />{discovery.attributions.map((item, index) => <span key={index}>{safeExternalUrl(item.uri) ? <a href={safeExternalUrl(item.uri)} target="_blank" rel="noreferrer">{item.displayName}</a> : item.displayName}</span>)}</div>}
            {discovery.stores.length === 0 && <div className="empty-state"><span className="state-icon"><Icon name="pin" /></span><h2>No stores in this search</h2><p>A wider radius or another location might do the trick.</p><button className="button button-secondary" onClick={() => go(1)}>Edit search</button></div>}
            <Notices items={discovery.notices} />
            {!!discovery.stores.length && <div className="flow-actions"><button className="button button-primary" disabled={state.storeIds.length === 0} onClick={checkPricing}>Continue{state.storeIds.length > 0 ? ` · ${state.storeIds.length} selected` : ""}</button></div>}
          </>}
        </>}

        {step === 3 && <>
          <SectionHeading title="Make it your kind of good." >A few preferences help us put the right meals on your table.</SectionHeading>
          {state.pricing && <div className="pricing-check" aria-label="Selected store pricing"><div className="pricing-check-title"><Icon name="receipt" /><strong>Your store price check</strong></div>{state.pricing.stores.map(store => <p key={store.storeId}>
            <strong>{discovery?.stores.find(item => item.id === store.storeId)?.name}</strong>{" · "}
            {store.status === "unavailable" ? store.message : `${store.basis === "verified" ? "Verified" : "Illustrative"} prices · ${store.offers.length} package prices available${store.missingIngredientIds.length ? ` · ${store.missingIngredientIds.length} ingredients without prices` : ""}`}
          </p>)}<p>A plan needs prices for every ingredient it uses. Prices are checked again when you create it.</p></div>}
          <form onSubmit={event => { event.preventDefault(); validatePreferences(4); }} noValidate>
            <Counter label="Household size" value={preferences.servingsPerMeal} min={1} max={8} onChange={servingsPerMeal => changePreferences({ servingsPerMeal })} />
            <div className="budget-field"><label className="field-label" htmlFor="budget">Grocery budget <span>{currency}</span></label>
              <input className="budget-input" id="budget" inputMode="decimal" value={budget} aria-invalid={!!validation} aria-describedby="budget-help preference-error" onChange={event => { setBudget(event.target.value); dispatch({ type: "clear-result" }); setValidation(""); }} />
              <p className="small-note" id="budget-help">Whole packages for your planned meals.</p>
            </div>
            <fieldset className="field-block"><legend>Diet</legend><div className="chip-group">{dietSchema.options.map(diet => <button type="button" className="choice-chip" key={diet} aria-pressed={preferences.dietaryRestrictions.includes(diet)} onClick={() => changePreferences({ dietaryRestrictions: toggleValue(preferences.dietaryRestrictions, diet) })}>{labels[diet]}</button>)}</div></fieldset>
            <details className="disclosure"><summary>Allergens <span>{preferences.excludedAllergens.length || "None"}</span></summary>
              <fieldset><legend className="sr-only">Exclude allergens</legend><div className="chip-group">{allergenSchema.options.map(allergen => <button type="button" className="choice-chip" key={allergen} aria-pressed={preferences.excludedAllergens.includes(allergen)} onClick={() => changePreferences({ excludedAllergens: toggleValue(preferences.excludedAllergens, allergen) })}>{labels[allergen]}</button>)}</div></fieldset><p className="small-note">Excluded from meals. Check product labels.</p>
            </details>
            <details className="disclosure"><summary>Exclude ingredients <span>{preferences.excludedIngredientIds.length || "None"}</span></summary>
              <label className="sr-only" htmlFor="ingredient-search">Search ingredients to exclude</label><input className="text-input search-input" id="ingredient-search" type="search" placeholder="Search ingredients" value={ingredientSearch} onChange={event => setIngredientSearch(event.target.value)} />
              <div className="ingredient-options">{ingredients.filter(item => item.name.toLowerCase().includes(ingredientSearch.toLowerCase()) || preferences.excludedIngredientIds.includes(item.id)).map(item => <label key={item.id}><input type="checkbox" checked={preferences.excludedIngredientIds.includes(item.id)} onChange={() => changePreferences({ excludedIngredientIds: toggleValue(preferences.excludedIngredientIds, item.id) })} />{item.name}</label>)}{!ingredients.some(item => item.name.toLowerCase().includes(ingredientSearch.toLowerCase())) && <p>No matches</p>}</div>
            </details>
            <label className="switch-row"><span>Prefer more protein</span><input className="switch" type="checkbox" checked={preferences.nutritionPriorities.includes("high-protein")} onChange={event => changePreferences({ nutritionPriorities: event.target.checked ? ["high-protein"] : [] })} /></label>
            <p className="field-error" id="preference-error" role={validation ? "alert" : undefined}>{validation}</p>
            <div className="flow-actions"><button className="button button-primary" type="submit">Continue</button></div>
          </form>
        </>}

        {step === 4 && <>
          <SectionHeading title="What’s on the menu?">Choose how many meals to plan and what matters most to you.</SectionHeading>
          <div className="plan-preview"><MealArt kind="bowl" /><div><span className="eyebrow">A PLAN WITH YOUR NAME ON IT</span><p>{preferences.servingsPerMeal} servings per meal.<br />{formatMoney(preferences.weeklyBudget)} to work with.</p></div></div>
          <Counter label="Number of meals" value={preferences.mealCount} min={1} max={14} onChange={mealCount => changePreferences({ mealCount })} />
          <fieldset className="field-block"><legend>Priority</legend><div className="objective-options">
            {([ ["balanced", "A little of everything", "Balance cost, estimated nutrition and ingredient reuse."], ["minimize-cost", "Make my budget go further", "Prioritize the lowest complete basket cost."], ["maximize-nutrition", "Put nutrition first", "Prioritize estimated nutrition within your budget."] ] as const).map(([value, label, description]) => <label className="objective-row" key={value}><span><strong>{label}</strong><small>{description}</small></span><input type="radio" name="objective" value={value} checked={preferences.objective === value} onChange={() => changePreferences({ objective: value })} /></label>)}
          </div></fieldset>
          <details className="disclosure plan-review"><summary>Your choices</summary><dl>
            <div><dt>Budget</dt><dd>{formatMoney(preferences.weeklyBudget)}</dd></div>
            <div><dt>Servings per meal</dt><dd>{preferences.servingsPerMeal}</dd></div>
            <div><dt>Stores</dt><dd>{discovery?.stores.filter(store => state.storeIds.includes(store.id)).map(store => store.name).join(", ")}</dd></div>
            {(preferences.dietaryRestrictions.length > 0 || preferences.excludedAllergens.length > 0 || preferences.excludedIngredientIds.length > 0) && <div><dt>Food preferences</dt><dd>{[...preferences.dietaryRestrictions.map(value => labels[value]), ...preferences.excludedAllergens.map(value => `No ${labels[value].toLowerCase()}`), ...preferences.excludedIngredientIds.map(id => `No ${ingredients.find(item => item.id === id)?.name.toLowerCase() ?? id}`)].join(", ")}</dd></div>}
            {preferences.nutritionPriorities.length > 0 && <div><dt>Nutrition</dt><dd>Prefer more protein</dd></div>}
          </dl><button className="text-button" onClick={() => go(3)}>Edit preferences</button></details>
          <p className="field-error" role={validation ? "alert" : undefined}>{validation}</p>
          <div className="flow-actions"><button className="button button-primary" onClick={optimize}>Create my meal plan <Icon name="spark" /></button></div>
        </>}

        {step === 5 && <>
          {busy ? <><SectionHeading title="A little meal magic…" /><LoadingState title="Bringing your plan together" description="Checking meals, whole-package costs and your preferences. One thoughtful basket at a time." /><button className="text-button" onClick={() => go(4)}>Cancel and review</button></> : error ? errorPanel : state.result ? <PlanResults result={state.result} stores={discovery?.stores ?? []} recipes={recipes} ingredients={ingredients} products={products} onEdit={() => go(3)} /> : <><SectionHeading title="Your plan" /><button className="button button-primary" onClick={() => go(4)}>Review plan</button></>}
        </>}
      </div>
      </div>
    </div>
  );
}
