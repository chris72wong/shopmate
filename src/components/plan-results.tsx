"use client";

import { useState } from "react";
import type { CoreOptimizationResult, PriceBasis, Ingredient, MixedStorePlan, OptimizationResult, OptimizationResultV2, ProductPackage, Recipe, Store, StoreV2 } from "@/contracts";
import { formatMoney } from "@/lib/format";
import { safeExternalUrl } from "@/lib/planner";
import { Icon, MealArt, recipeArtKind } from "@/components/grocery-art";
import { Notices, SectionHeading } from "./planner-ui";

interface ResultProps {
  result: OptimizationResult | OptimizationResultV2;
  stores: (Store | StoreV2)[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  products: ProductPackage[];
  onEdit: () => void;
  onChooseStores: () => void;
}

export function PlanResults(props: ResultProps) {
  const { result, onEdit, onChooseStores } = props;
  if (result.status === "feasible" || ("mixedStorePlan" in result && result.mixedStorePlan)) return <AvailablePlans {...props} />;
  const pricingUnavailable = result.status === "infeasible" && result.reason === "pricing-unavailable";
  return <>
    <SectionHeading title={pricingUnavailable ? "Ingredient prices unavailable" : result.status === "incomplete" ? "Search paused" : "No matching plan"} />
    <div className="empty-state">
      <span className="state-icon"><Icon name={result.status === "incomplete" ? "bowl" : "basket"} /></span>
      <p>{result.message}</p>
      {result.status === "incomplete" && <p className="small-note">The search ended early. A plan may still be possible.</p>}
      {result.status === "infeasible" && result.minimumKnownCost && <p className="small-note">Lowest known cost: {formatMoney(result.minimumKnownCost)} · {result.pricingBasis === "verified" ? "verified quote" : "illustrative"}</p>}
      <button className="button button-primary" onClick={pricingUnavailable ? onChooseStores : onEdit}>{pricingUnavailable ? "Choose other stores" : "Edit preferences"}</button>
    </div>
    <Notices items={result.notices} />
  </>;
}

type SinglePlan = Extract<CoreOptimizationResult<PriceBasis>, { status: "feasible" }>;

function AvailablePlans(props: ResultProps) {
  const single = props.result.status === "feasible" ? props.result : null;
  const mixed = "mixedStorePlan" in props.result ? props.result.mixedStorePlan : null;
  const [strategy, setStrategy] = useState<"single" | "mixed">(single ? "single" : "mixed");
  const plan = strategy === "mixed" && mixed ? mixed : single;
  if (!plan) return null;
  return <>
    {single && mixed && <nav className="result-nav" aria-label="Shopping strategy">
      <button aria-pressed={strategy === "single"} onClick={() => setStrategy("single")}>One store · {formatMoney(single.total)}</button>
      <button aria-pressed={strategy === "mixed"} onClick={() => setStrategy("mixed")}>Across stores · {formatMoney(mixed.total)}</button>
    </nav>}
    <FeasiblePlan key={strategy} {...props} plan={plan} />
  </>;
}

function FeasiblePlan({ result, plan, stores, recipes, ingredients, products, onEdit }: ResultProps & { plan: SinglePlan | MixedStorePlan }) {
  const single = "status" in plan ? plan : null;
  const mixed = "status" in plan ? null : plan;
  const [view, setView] = useState<"meals" | "stores" | "list" | "nutrition">("meals");
  const [basketStoreId, setBasketStoreId] = useState(single?.recommendedStoreId ?? "all");
  const [checked, setChecked] = useState<string[]>([]);
  const [copyState, setCopyState] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const storeName = (id: string) => stores.find(store => store.id === id)?.name ?? "Store unavailable";
  const ingredientName = (id: string) => ingredients.find(item => item.id === id)?.name ?? id;
  const basket = single?.baskets.find(item => item.storeId === basketStoreId);
  const allLines = mixed?.lines ?? (basket?.status === "complete" ? basket.lines.map(line => ({ ...line, storeId: basket.storeId })) : []);
  const lines = mixed && basketStoreId !== "all" ? allLines.filter(line => line.storeId === basketStoreId) : allLines;
  const listTotal = mixed ? (basketStoreId === "all" ? mixed.total : mixed.stores.find(store => store.storeId === basketStoreId)?.total) : basket?.status === "complete" ? basket.total : null;
  const keyFor = (index: number) => {
    const line = lines[index]!;
    return JSON.stringify([line.storeId, line.ingredientId, line.productId]);
  };
  const done = lines.filter((_, index) => checked.includes(keyFor(index))).length;
  const basisLabel = result.pricingBasis === "verified" ? "Verified quote" : "Illustrative";
  const pricing = "pricing" in result ? result.pricing : null;
  const offersFor = (storeId: string) => {
    const quote = pricing?.stores.find(store => store.storeId === storeId);
    return quote?.status === "available" && quote.basis === "verified" ? quote.offers : [];
  };
  const recommendedOffers = mixed ? mixed.lines.flatMap(line => offersFor(line.storeId).filter(offer => offer.product.id === line.productId)) : offersFor(single?.recommendedStoreId ?? "");
  const productLabel = (item: ProductPackage | undefined) => item ? (result.pricingBasis === "verified" ? `${item.name} · ${item.label}` : item.label) : undefined;
  const productFor = (id: string, storeId: string) => offersFor(storeId).find(offer => offer.product.id === id)?.product ?? products.find(item => item.id === id);
  const nutrition = plan.estimatedTotalNutrition;

  async function copyList() {
    const text = `${mixed && basketStoreId === "all" ? "Across stores" : storeName(basketStoreId)} — ${basisLabel.toLowerCase()} shopping list\n` + lines.map(line => {
      const product = productFor(line.productId, line.storeId);
      return `${mixed ? `${storeName(line.storeId)}: ` : ""}${line.packageCount} × ${productLabel(product) ?? ingredientName(line.ingredientId)} — ${formatMoney(line.subtotal)}`;
    }).join("\n");
    try { await navigator.clipboard.writeText(text); setCopyState("Copied"); }
    catch { setCopyState("Copy unavailable. Try Print."); }
  }

  return <>
    <SectionHeading title={view === "list" ? "Shopping list" : view === "nutrition" ? "Nutrition" : view === "stores" ? "Compare stores" : "Your meals"} />
    {view !== "nutrition" && <p className="data-note">{result.pricingBasis === "verified" ? "Verified branch quotes · prices may change before checkout" : "Illustrative prices"}</p>}
    {(view === "meals" || view === "stores") && <div className="plan-cost">
    <div className="cost-line"><div><span className="cost-label">{mixed ? "Across-store total" : "Basket total"}</span><strong>{formatMoney(plan.total)}</strong></div><span className="budget-left">{formatMoney(plan.budgetRemaining)} left</span></div>
      <p>{mixed ? `${mixed.stores.length} ${mixed.stores.length === 1 ? "store" : "stores"}` : storeName(single?.recommendedStoreId ?? "")} · {plan.meals.length} {plan.meals.length === 1 ? "meal" : "meals"}</p>
      {mixed && <p className="small-note">Buy the listed items at each store. Travel costs are excluded.{mixed.savings && ` ${formatMoney(mixed.savings.amount)} less than the same meals at ${storeName(mixed.savings.comparedToStoreId)}.`}</p>}
      {recommendedOffers.length > 0 && <p className="small-note">{recommendedOffers[0]!.provenance.channel} · retrieved {new Date(Math.min(...recommendedOffers.map(offer => Date.parse(offer.provenance.retrievedAt)))).toLocaleString()} · excludes taxes, fees and deposits</p>}
    </div>}
    <nav className="result-nav" aria-label="Plan views">
      {([ ["meals", "Meals"], ["stores", "Stores"], ["list", "Shopping list"], ["nutrition", "Nutrition"] ] as const).map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </nav>
    <section aria-label={view === "meals" ? "Meals" : view === "stores" ? "Store comparisons" : view === "list" ? "Shopping list" : "Estimated nutrition"}>
      {view === "meals" && <>
        <div className="meal-list">{plan.meals.map(meal => {
          const recipe = recipes.find(item => item.id === meal.recipeId);
          return <details className="meal-detail" key={meal.slot}>
            <summary>
              {recipe && <MealArt className="meal-thumbnail" kind={recipeArtKind(recipe)} />}
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
        <p className="result-footnote">Nutrition is estimated.</p>
      </>}

      {view === "stores" && single && <>
        <p className="data-note">One complete basket per store.</p>
        <div>{single.baskets.map(item => <article key={item.storeId} className={`basket-row ${item.status === "complete" && item.storeId === single.recommendedStoreId ? "is-recommended" : ""}`}>
          <header><h2><Icon name="basket" />{storeName(item.storeId)}</h2>{item.status === "complete" && <strong>{formatMoney(item.total)}</strong>}</header>
          {item.status === "complete" ? <>
            <p>{item.storeId === single.recommendedStoreId ? `Lowest complete basket · ${basisLabel.toLowerCase()}` : `Complete basket · ${basisLabel.toLowerCase()}`}</p>
            <button className="text-button" onClick={() => { setBasketStoreId(item.storeId); setCopyState(""); setView("list"); }}>View shopping list</button>
          </> : <><p>Pricing unavailable</p><details className="usage-details"><summary>Missing items</summary><p>{item.missingIngredientIds.map(ingredientName).join(", ")}</p><p>{item.reason}</p></details></>}
        </article>)}</div>
        {single.basketSavings && <p className="result-footnote">{formatMoney(single.basketSavings.amount)} less than {storeName(single.basketSavings.comparedToStoreId)} for this basket. {basisLabel} comparison.</p>}
      </>}

      {view === "stores" && mixed && <>
        <p className="data-note">Each amount covers only the items assigned to that store.</p>
        {mixed.stores.map(store => <article className="basket-row" key={store.storeId}>
          <header><h2><Icon name="basket" />{storeName(store.storeId)}</h2><strong>{formatMoney(store.total)}</strong></header>
          <p>Assigned items · {basisLabel.toLowerCase()}</p>
          <button className="text-button" onClick={() => { setBasketStoreId(store.storeId); setCopyState(""); setView("list"); }}>View shopping list</button>
        </article>)}
      </>}

      {view === "list" && <>
        <div className="list-toolbar"><label><span className="sr-only">Shopping list store</span><select value={basketStoreId} onChange={event => { setBasketStoreId(event.target.value); setCopyState(""); }}>{mixed && <option value="all">All assigned stores</option>}{(mixed?.stores ?? single?.baskets.filter(item => item.status === "complete") ?? []).map(item => <option key={item.storeId} value={item.storeId}>{storeName(item.storeId)}</option>)}</select></label><span aria-live="polite">{done}/{lines.length} done</span></div>
        <div className="list-tools"><button className="text-button" onClick={copyList}>Copy list</button><button className="text-button" onClick={() => window.print()}>Print</button><button className="text-button" aria-pressed={showUsage} onClick={() => setShowUsage(previous => !previous)}>Package details</button></div><p className="copy-status" role="status">{copyState}</p>
        <div className="list-progress" role="progressbar" aria-label="Shopping list completion" aria-valuemin={0} aria-valuemax={lines.length || 1} aria-valuenow={done}><span style={{ width: `${lines.length ? done / lines.length * 100 : 0}%` }} /></div>
        {(["produce", "grains", "proteins", "dairy", "pantry", "other"] as const).map(category => {
          const group = lines.map((line, index) => ({ line, index })).filter(({ line }) => (ingredients.find(item => item.id === line.ingredientId)?.category ?? "other") === category);
          return group.length ? <div className="grocery-group" key={category}><h3>{category}</h3>{group.map(({ line, index }) => {
            const product = productFor(line.productId, line.storeId);
            return <div className="grocery-item" key={index}>
              <label className={`grocery-line ${checked.includes(keyFor(index)) ? "is-checked" : ""}`}>
                <input type="checkbox" checked={checked.includes(keyFor(index))} onChange={() => setChecked(previous => previous.includes(keyFor(index)) ? previous.filter(key => key !== keyFor(index)) : [...previous, keyFor(index)])} />
                <span><strong>{ingredientName(line.ingredientId)}</strong>{mixed && <small>{storeName(line.storeId)}</small>}<small>{line.packageCount} × {productLabel(product) ?? line.productId}</small></span><strong>{formatMoney(line.subtotal)}</strong>
              </label>
              {offersFor(line.storeId).filter(offer => offer.product.id === line.productId).map(offer => <p className="small-note" key={offer.product.id}>
                {offer.provenance.providerId} · {offer.provenance.channel} · retrieved {new Date(offer.provenance.retrievedAt).toLocaleString()} · valid until {new Date(offer.provenance.expiresAt).toLocaleString()}
                {offer.provenance.sourceUrl && safeExternalUrl(offer.provenance.sourceUrl) && <> · <a href={safeExternalUrl(offer.provenance.sourceUrl)} target="_blank" rel="noreferrer">Product source</a></>}
              </p>)}
              {showUsage && <p className="usage-details">Buy {line.purchased.quantity} {line.purchased.unit} · use {line.required.quantity} {line.required.unit} · leftover {line.leftover.quantity} {line.leftover.unit}</p>}
            </div>;
          })}</div> : null;
        })}
        <p className="list-total">{basisLabel} {mixed && basketStoreId !== "all" ? "assigned subtotal" : "total"} <strong>{listTotal ? formatMoney(listTotal) : "Unavailable"}</strong></p>
        <p className="result-footnote">Whole packages. Excludes taxes, fees, deposits, delivery, and discounts. Leftovers are unused package contents.</p>
      </>}

      {view === "nutrition" && <>
        <p className="data-note">Estimated totals · all meals and servings</p>
        <div className="nutrition-grid">{([ ["Energy", nutrition.caloriesKcal, "kcal"], ["Protein", nutrition.proteinG, "g"], ["Carbs", nutrition.carbsG, "g"], ["Fat", nutrition.fatG, "g"], ["Fiber", nutrition.fiberG, "g"] ] as const).map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{Math.round(value)} <small>{unit}</small></strong></div>)}</div>
        <p className="result-footnote">Not daily nutrition targets. Check actual product labels for allergens and substitutions.</p>
        {single && single.ingredientReuse.length > 0 && <details className="disclosure reuse-list"><summary>Ingredient reuse</summary>{single.ingredientReuse.map(item => <p key={item.ingredientId}>{ingredientName(item.ingredientId)} · {item.recipeIds.length} recipes · {item.packagesAvoided} packages avoided · {formatMoney(item.estimatedSavings)} {basisLabel.toLowerCase()} savings versus separate meal purchases.</p>)}</details>}
      </>}
    </section>
    {(view === "meals" || view === "stores") && <p className="result-footnote">{plan.optimality === "best-found" ? "Best plan found. Search may be incomplete." : "Best within the searched recipes."}</p>}
    <Notices items={[...(single?.explanations ?? []), ...result.notices]} />
    <div className="flow-actions"><button className="button button-secondary" onClick={onEdit}>Edit preferences</button></div>
  </>;
}
