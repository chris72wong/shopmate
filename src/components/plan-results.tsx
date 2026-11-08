"use client";

import Image from "next/image";
import { useState } from "react";
import type { CoreOptimizationResult, PriceBasis, Ingredient, OptimizationResult, OptimizationResultV2, ProductPackage, Recipe, Store, StoreV2 } from "@/contracts";
import { formatMoney } from "@/lib/format";
import { safeExternalUrl } from "@/lib/planner";
import { mealPhoto } from "@/lib/meal-photo";
import { Notices, SectionHeading } from "./planner-ui";

interface ResultProps {
  result: OptimizationResult | OptimizationResultV2;
  stores: (Store | StoreV2)[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  products: ProductPackage[];
  onEdit: () => void;
}

export function PlanResults(props: ResultProps) {
  const { result, onEdit } = props;
  if (result.status !== "feasible") return <>
    <SectionHeading title={result.status === "incomplete" ? "Search paused" : "No matching plan"} />
    <div className="empty-state">
      <p>{result.message}</p>
      {result.status === "incomplete" && <p className="small-note">The search ended early. A plan may still be possible.</p>}
      {result.status === "infeasible" && result.minimumKnownCost && <p className="small-note">Lowest known cost: {formatMoney(result.minimumKnownCost)} · {result.pricingBasis === "verified" ? "verified quote" : "illustrative"}</p>}
      <button className="button button-primary" onClick={onEdit}>Edit preferences</button>
    </div>
    <Notices items={result.notices} />
  </>;
  return <FeasiblePlan {...props} result={result} />;
}

function FeasiblePlan({ result, stores, recipes, ingredients, products, onEdit }: ResultProps & { result: Extract<CoreOptimizationResult<PriceBasis>, { status: "feasible" }> & { pricing?: OptimizationResultV2["pricing"] } }) {
  const [view, setView] = useState<"meals" | "stores" | "list" | "nutrition">("meals");
  const [basketStoreId, setBasketStoreId] = useState(result.recommendedStoreId);
  const [checked, setChecked] = useState<string[]>([]);
  const [copyState, setCopyState] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const storeName = (id: string) => stores.find(store => store.id === id)?.name ?? "Store unavailable";
  const ingredientName = (id: string) => ingredients.find(item => item.id === id)?.name ?? id;
  const basket = result.baskets.find(item => item.storeId === basketStoreId);
  const lines = basket?.status === "complete" ? basket.lines : [];
  const keyFor = (index: number) => `${basketStoreId}:${index}`;
  const done = lines.filter((_, index) => checked.includes(keyFor(index))).length;
  const basisLabel = result.pricingBasis === "verified" ? "Verified quote" : "Illustrative";
  const quoted = result.pricing?.stores.find(store => store.storeId === basketStoreId);
  const offers = quoted?.status === "available" && quoted.basis === "verified" ? quoted.offers : [];
  const recommendedQuote = result.pricing?.stores.find(store => store.storeId === result.recommendedStoreId);
  const recommendedOffers = recommendedQuote?.status === "available" && recommendedQuote.basis === "verified" ? recommendedQuote.offers : [];
  const productLabel = (item: ProductPackage | undefined) => item ? (result.pricingBasis === "verified" ? `${item.name} · ${item.label}` : item.label) : undefined;
  const productFor = (id: string) => offers.find(offer => offer.product.id === id)?.product ?? products.find(item => item.id === id);
  const nutrition = result.estimatedTotalNutrition;

  async function copyList() {
    const text = `${storeName(basketStoreId)} — ${basisLabel.toLowerCase()} shopping list\n` + lines.map(line => {
      const product = productFor(line.productId);
      return `${line.packageCount} × ${productLabel(product) ?? ingredientName(line.ingredientId)} — ${formatMoney(line.subtotal)}`;
    }).join("\n");
    try { await navigator.clipboard.writeText(text); setCopyState("Copied"); }
    catch { setCopyState("Copy unavailable. Try Print."); }
  }

  return <>
    <SectionHeading title={view === "list" ? "Shopping list" : view === "nutrition" ? "Nutrition" : "Your plan"} />
    {view !== "nutrition" && <p className="data-note">{result.pricingBasis === "verified" ? "Verified branch quotes · prices may change before checkout" : "Illustrative prices"}</p>}
    {(view === "meals" || view === "stores") && <div className="plan-cost">
      <div className="cost-line"><strong>{formatMoney(result.total)}</strong><span>{formatMoney(result.budgetRemaining)} left</span></div>
      <p>{storeName(result.recommendedStoreId)} · {result.meals.length} meals</p>
      {recommendedOffers.length > 0 && <p className="small-note">{recommendedOffers[0]!.provenance.channel} · retrieved {new Date(Math.min(...recommendedOffers.map(offer => Date.parse(offer.provenance.retrievedAt)))).toLocaleString()} · excludes taxes, fees and deposits</p>}
    </div>}
    <nav className="result-nav" aria-label="Plan views">
      {([ ["meals", "Meals"], ["stores", "Stores"], ["list", "Shopping list"], ["nutrition", "Nutrition"] ] as const).map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </nav>
    <section aria-label={view === "meals" ? "Meals" : view === "stores" ? "Store comparisons" : view === "list" ? "Shopping list" : "Estimated nutrition"}>
      {view === "meals" && <>
        <div className="meal-list">{result.meals.map(meal => {
          const recipe = recipes.find(item => item.id === meal.recipeId);
          return <details className="meal-detail" key={meal.slot}>
            <summary>
              {recipe && <Image className="meal-thumbnail" src={mealPhoto(recipe)} alt="" width={166} height={166} sizes="83px" />}
              <span className="meal-label"><small>Meal {meal.slot + 1}</small><h2>{recipe?.name ?? "Recipe unavailable"}</h2><span>{recipe ? `${recipe.totalMinutes} min · ` : ""}{meal.servings} servings</span></span>
            </summary>
            {recipe ? <div className="recipe-content">
              <p className="small-note">Per serving · estimated {Math.round(recipe.nutritionPerServing.caloriesKcal)} kcal · {recipe.nutritionPerServing.proteinG} g protein</p>
              <h3>Ingredients</h3>
              <ul>{recipe.ingredients.map(item => <li key={item.ingredientId}>{ingredientName(item.ingredientId)}<span>{Number((item.quantity * meal.servings / recipe.servings).toFixed(2))} {item.unit}</span></li>)}</ul>
              <h3>Method</h3><ol>{recipe.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              <p className="small-note">Listed allergens: {recipe.allergens.length ? recipe.allergens.join(", ") : "none"}. Check product labels and cross-contact.</p>
            </div> : <p className="small-note">Recipe details are missing from the current catalog.</p>}
          </details>;
        })}</div>
        <p className="result-footnote">Photos are serving inspiration. Nutrition is estimated.</p>
      </>}

      {view === "stores" && <>
        <p className="data-note">Same basket at each store. Purchases aren’t split.</p>
        <div>{result.baskets.map(item => <article key={item.storeId} className="basket-row">
          <header><h2>{storeName(item.storeId)}</h2>{item.status === "complete" && <strong>{formatMoney(item.total)}</strong>}</header>
          {item.status === "complete" ? <>
            <p>{item.storeId === result.recommendedStoreId ? `Lowest complete basket · ${basisLabel.toLowerCase()}` : `Complete basket · ${basisLabel.toLowerCase()}`}</p>
            <button className="text-button" onClick={() => { setBasketStoreId(item.storeId); setCopyState(""); setView("list"); }}>View shopping list</button>
          </> : <><p>Pricing unavailable</p><details className="usage-details"><summary>Missing items</summary><p>{item.missingIngredientIds.map(ingredientName).join(", ")}</p><p>{item.reason}</p></details></>}
        </article>)}</div>
        {result.basketSavings && <p className="result-footnote">{formatMoney(result.basketSavings.amount)} less than {storeName(result.basketSavings.comparedToStoreId)} for this basket. {basisLabel} comparison.</p>}
      </>}

      {view === "list" && <>
        <div className="list-toolbar"><label><span className="sr-only">Shopping list store</span><select value={basketStoreId} onChange={event => { setBasketStoreId(event.target.value); setCopyState(""); }}>{result.baskets.filter(item => item.status === "complete").map(item => <option key={item.storeId} value={item.storeId}>{storeName(item.storeId)}</option>)}</select></label><span aria-live="polite">{done}/{lines.length} done</span></div>
        <div className="list-tools"><button className="text-button" onClick={copyList}>Copy list</button><button className="text-button" onClick={() => window.print()}>Print</button><button className="text-button" aria-pressed={showUsage} onClick={() => setShowUsage(previous => !previous)}>Package details</button></div><p className="copy-status" role="status">{copyState}</p>
        {(["produce", "grains", "proteins", "dairy", "pantry", "other"] as const).map(category => {
          const group = lines.map((line, index) => ({ line, index })).filter(({ line }) => (ingredients.find(item => item.id === line.ingredientId)?.category ?? "other") === category);
          return group.length ? <div className="grocery-group" key={category}><h3>{category}</h3>{group.map(({ line, index }) => {
            const product = productFor(line.productId);
            return <div className="grocery-item" key={index}>
              <label className={`grocery-line ${checked.includes(keyFor(index)) ? "is-checked" : ""}`}>
                <input type="checkbox" checked={checked.includes(keyFor(index))} onChange={() => setChecked(previous => previous.includes(keyFor(index)) ? previous.filter(key => key !== keyFor(index)) : [...previous, keyFor(index)])} />
                <span><strong>{ingredientName(line.ingredientId)}</strong><small>{line.packageCount} × {productLabel(product) ?? line.productId}</small></span><strong>{formatMoney(line.subtotal)}</strong>
              </label>
              {offers.filter(offer => offer.product.id === line.productId).map(offer => <p className="small-note" key={offer.product.id}>
                {offer.provenance.providerId} · {offer.provenance.channel} · retrieved {new Date(offer.provenance.retrievedAt).toLocaleString()} · valid until {new Date(offer.provenance.expiresAt).toLocaleString()}
                {offer.provenance.sourceUrl && safeExternalUrl(offer.provenance.sourceUrl) && <> · <a href={safeExternalUrl(offer.provenance.sourceUrl)} target="_blank" rel="noreferrer">Product source</a></>}
              </p>)}
              {showUsage && <p className="usage-details">Buy {line.purchased.quantity} {line.purchased.unit} · use {line.required.quantity} {line.required.unit} · leftover {line.leftover.quantity} {line.leftover.unit}</p>}
            </div>;
          })}</div> : null;
        })}
        <p className="list-total">{basisLabel} total <strong>{basket?.status === "complete" ? formatMoney(basket.total) : "Unavailable"}</strong></p>
        <p className="result-footnote">Whole packages. Excludes taxes, fees, deposits, delivery, and discounts. Leftovers are unused package contents.</p>
      </>}

      {view === "nutrition" && <>
        <p className="data-note">Estimated totals · all meals and servings</p>
        <div className="nutrition-grid">{([ ["Energy", nutrition.caloriesKcal, "kcal"], ["Protein", nutrition.proteinG, "g"], ["Carbs", nutrition.carbsG, "g"], ["Fat", nutrition.fatG, "g"], ["Fiber", nutrition.fiberG, "g"] ] as const).map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{Math.round(value)} <small>{unit}</small></strong></div>)}</div>
        <p className="result-footnote">Not daily nutrition targets. Check actual product labels for allergens and substitutions.</p>
        {result.ingredientReuse.length > 0 && <details className="disclosure reuse-list"><summary>Ingredient reuse</summary>{result.ingredientReuse.map(item => <p key={item.ingredientId}>{ingredientName(item.ingredientId)} · {item.recipeIds.length} recipes · {item.packagesAvoided} packages avoided · {formatMoney(item.estimatedSavings)} {basisLabel.toLowerCase()} savings versus separate meal purchases.</p>)}</details>}
      </>}
    </section>
    {(view === "meals" || view === "stores") && <p className="result-footnote">{result.optimality === "best-found" ? "Best plan found. Search may be incomplete." : "Best plan within the searched catalog."}</p>}
    <Notices items={[...result.explanations, ...result.notices]} />
    <div className="flow-actions"><button className="button button-secondary" onClick={onEdit}>Edit preferences</button></div>
  </>;
}
