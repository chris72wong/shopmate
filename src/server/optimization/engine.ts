import "server-only";
import { currencyForCountry, optimizationRequestSchema, type BasketLine, type CoreOptimizationResult, type RepricedBasket, type PriceBasis,
  type Ingredient, type IngredientRequirement, type IngredientReuse, type MixedStorePlan, type Nutrition, type OptimizationRequest,
  type OptimizationResult, type ProductPackage, type Recipe } from "@/contracts";
import { ingredients as catalogIngredients } from "@/data/ingredients";
import { recipes as catalogRecipes } from "@/data/recipes";
import { products as catalogProducts } from "@/data/pricing";
import type { ResolvedStore } from "@/server/discovery/provider";
import type { GroceryPricingProvider } from "@/server/pricing/provider";
import { invalidRequest } from "@/server/errors";
import { PackageSearchLimitError, purchasePackages, quantityValue, type PricedPackage } from "@/server/optimization/packages";

export interface OptimizationEngine {
  optimize(request: OptimizationRequest, stores: readonly ResolvedStore[], pricing: GroceryPricingProvider): Promise<OptimizationResult>;
}
export const OPTIMIZER_VERSION = "catalog-multiset-2";
export const DEFAULT_EVALUATION_LIMIT = 20_000;
export interface EngineOptions { ingredients?: readonly Ingredient[]; recipes?: readonly Recipe[]; products?: readonly ProductPackage[]; evaluationLimit?: number; onCandidates?: (ids: string[]) => void; onMixedPlan?: (plan: MixedStorePlan | null) => void }
export interface PackageSnapshot { storeId: string; packages: PricedPackage[]; unavailable?: string }
type CompleteBasket<B extends PriceBasis> = Extract<RepricedBasket<B>, { status: "complete" }>;
const moneyTotal = (lines: readonly BasketLine[]): number => lines.reduce((sum, line) => sum + line.subtotal.amountCents, 0);
const packageTotal = (lines: readonly BasketLine[]): number => lines.reduce((sum, line) => sum + line.packageCount, 0);
const emptyNutrition = (): Nutrition => ({ caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });

export function aggregateRequirements(meals: readonly Recipe[], servings: number): IngredientRequirement[] {
  const aggregated = new Map<string, IngredientRequirement>();
  for (const recipe of meals) for (const item of recipe.ingredients) {
    const existing = aggregated.get(item.ingredientId);
    if (existing && existing.unit !== item.unit) throw new Error("Incompatible canonical ingredient units.");
    const value = item.quantity * servings / recipe.servings;
    if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid recipe yield or quantity.");
    if (existing) {
      existing.quantity += value;
      if (!existing.usedByRecipeIds.includes(recipe.id)) existing.usedByRecipeIds.push(recipe.id);
    } else aggregated.set(item.ingredientId, { ingredientId: item.ingredientId, quantity: value, unit: item.unit, usedByRecipeIds: [recipe.id] });
  }
  return [...aggregated.values()].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId, "en"))
    .map(item => ({ ...item, quantity: quantityValue(item.quantity), usedByRecipeIds: item.usedByRecipeIds.sort() }));
}
function* candidates(recipes: readonly Recipe[], count: number): Generator<Recipe[]> {
  // Seed repeated and varied plans before lexicographic enumeration, to make capped searches useful.
  for (const recipe of recipes) yield Array<Recipe>(count).fill(recipe);
  for (let offset = 0; offset < recipes.length; offset++) yield Array.from({ length: count }, (_, index) => recipes[(offset + index) % recipes.length]!);
  function* combinations(start: number, chosen: Recipe[]): Generator<Recipe[]> {
    if (chosen.length === count) { yield chosen; return; }
    for (let index = start; index < recipes.length; index++) yield* combinations(index, [...chosen, recipes[index]!]);
  }
  yield* combinations(0, []);
}

export function createOptimizationEngine(options: EngineOptions = {}): OptimizationEngine {
  const optimizePackages = createPackageOptimizer("illustrative", options);
  const products = options.products ?? catalogProducts;
  return { async optimize(input, stores, pricing) {
    if (input.mode !== "demo") invalidRequest("mode", "Sample-price optimization requires explicit demo mode. Use /api/v2/optimize for live prices.");
    return optimizePackages(input, stores, async () => Promise.all(stores.map(async store => {
      const candidates = products.filter(product => product.countries.includes(input.country));
      const snapshot = await pricing.getOffers(store, candidates.map(product => product.id));
      const packages: PricedPackage[] = [];
      if (snapshot.storeId !== store.id || snapshot.status === "unavailable" || store.pricing.status === "unavailable") return { storeId: store.id, packages, unavailable: "No usable pricing is available for this store." };
      for (const offer of snapshot.offers) {
        const product = candidates.find(item => item.id === offer.productId);
        if (!product || !offer.available || offer.basis !== "illustrative" || offer.profileId !== store.pricing.profileId
          || offer.price.currency !== currencyForCountry(input.country) || !Number.isSafeInteger(offer.price.amountCents) || offer.price.amountCents <= 0) continue;
        if (packages.some(item => item.product.id === product.id)) throw new Error("Duplicate product offers.");
        packages.push({ product, price: offer.price });
      }
      return { storeId: store.id, packages };
    })));
  } };
}

/** One numeric engine shared by sample and verified pricing; no real quote is cast into a sample offer. */
export function createPackageOptimizer<B extends PriceBasis>(basis: B, options: EngineOptions = {}) {
  const ingredients = options.ingredients ?? catalogIngredients;
  const recipes = options.recipes ?? catalogRecipes;
  const limit = options.evaluationLimit ?? DEFAULT_EVALUATION_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Evaluation limit must be a positive integer.");
  const ingredientById = new Map(ingredients.map(item => [item.id, item]));
  return async (input: OptimizationRequest, stores: readonly ResolvedStore[], loadSnapshots: () => Promise<PackageSnapshot[]>): Promise<CoreOptimizationResult<B>> => {
    const validated = optimizationRequestSchema.safeParse(input);
    if (!validated.success) invalidRequest("preferences", "Invalid optimization request.");
    const request = validated.data;
    if ((basis === "verified") !== (request.mode === "live")) invalidRequest("mode", "Pricing basis and explicit mode must agree.");
    const { preferences } = request;
    const currency = currencyForCountry(request.country);
    if (stores.length !== request.storeIds.length || new Set(stores.map(store => store.id)).size !== stores.length
      || request.storeIds.some(id => !stores.some(store => store.id === id))
      || stores.some(store => store.country !== request.country || store.source !== (request.mode === "demo" ? "demo" : "google"))) invalidRequest("storeIds", "Resolve every selected store in the same country and mode.");
    for (const id of preferences.excludedIngredientIds) if (!ingredientById.has(id)) invalidRequest("preferences.excludedIngredientIds", "Choose only known catalog ingredients.");
    const eligible = recipes.filter(recipe => preferences.dietaryRestrictions.every(diet => recipe.diets.includes(diet))
      && recipe.ingredients.every(item => {
        const ingredient = ingredientById.get(item.ingredientId);
        if (!ingredient || ingredient.unit !== item.unit) throw new Error("Invalid catalog ingredient reference.");
        return !preferences.excludedIngredientIds.includes(item.ingredientId)
          && !ingredient.allergens.some(allergen => preferences.excludedAllergens.includes(allergen))
          && preferences.dietaryRestrictions.every(diet => ingredient.diets.includes(diet));
      }) && !recipe.allergens.some(allergen => preferences.excludedAllergens.includes(allergen)))
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    options.onCandidates?.(eligible.map(recipe => recipe.id));
    let evaluatedCombinations = 0;
    let exhaustive = true;
    const notices = [basis === "illustrative" ? "All prices are illustrative samples, not current, observed or branch-specific retailer prices. Taxes, fees, deposits and travel are excluded." : "Prices are observed retailer quotes for the identified branches and channel, not checkout guarantees. Taxes, fees, deposits and travel are excluded.",
      "Nutrition and allergen metadata are sample estimates. Check actual packaging and cross-contact information.",
      `Optimizer ${OPTIMIZER_VERSION}: all multisets of ${preferences.mealCount} meals from ${eligible.length} eligible catalog recipes, allowing repeats; deterministic evaluation limit ${limit}.`,
      request.mode === "demo" ? "Selected stores are fictional demo stores." : "Only reviewed products with complete, fresh, same-channel branch pricing may enter a live basket."];
    const base = () => ({ mode: request.mode, country: request.country, currency, pricingBasis: basis,
      search: { evaluatedCombinations, exhaustive }, notices });
    if (!eligible.length) return { ...base(), status: "infeasible", reason: "dietary-constraints", message: "No recipes in this catalog satisfy all of the selected dietary restrictions and exclusions.", minimumKnownCost: null };

    // Fetch exactly once per selected store; every candidate uses this same request-local offer set.
    const snapshots = await loadSnapshots();
    const packagesByStore = new Map<string, Map<string, PricedPackage[]>>();
    const unavailableReasons = new Map<string, string>();
    stores.forEach((store, index) => {
      const snapshot = snapshots[index];
      const byIngredient = new Map<string, PricedPackage[]>();
      if (!snapshot || snapshot.storeId !== store.id || snapshot.unavailable) unavailableReasons.set(store.id, "No usable pricing is available for this store.");
      else for (const item of snapshot.packages) {
        const { product, price } = item;
        if (!product.countries.includes(request.country) || price.currency !== currency || !Number.isSafeInteger(price.amountCents) || price.amountCents <= 0) continue;
        const group = byIngredient.get(product.ingredientId) ?? [];
        // Ambiguous duplicate offers are rejected instead of silently picking a favorable quote.
        if (group.some(item => item.product.id === product.id)) throw new Error("Duplicate product offers.");
        group.push(item); byIngredient.set(product.ingredientId, group);
      }
      packagesByStore.set(store.id, byIngredient);
    });
    const packageCache = new Map<string, BasketLine[] | null>();
    let packageSearchTruncated = false;
    function exactPurchase(item: IngredientRequirement, packages: PricedPackage[]) {
      try { return purchasePackages(item.ingredientId, item, packages, currency); }
      catch (error) { if (!(error instanceof PackageSearchLimitError)) throw error; packageSearchTruncated = true; return null; }
    }
    function purchase(storeId: string, item: IngredientRequirement): BasketLine[] | null {
      const key = `${storeId}:${item.ingredientId}:${item.quantity}:${item.unit}`;
      if (!packageCache.has(key)) packageCache.set(key, exactPurchase(item, packagesByStore.get(storeId)?.get(item.ingredientId) ?? []));
      return packageCache.get(key)!;
    }
    function basketsFor(requirements: IngredientRequirement[]): RepricedBasket<B>[] {
      return stores.map(store => {
        const lines: BasketLine[] = []; const missingIngredientIds: string[] = [];
        for (const item of requirements) {
          const purchases = purchase(store.id, item);
          if (!purchases) missingIngredientIds.push(item.ingredientId); else lines.push(...purchases);
        }
        return missingIngredientIds.length || unavailableReasons.has(store.id)
          ? { status: "unavailable", storeId: store.id, missingIngredientIds, reason: unavailableReasons.get(store.id) ?? "Some required ingredients have no compatible package price." }
          : { status: "complete", storeId: store.id, lines, total: { amountCents: moneyTotal(lines), currency }, basis };
      });
    }
    const mixedIdentity = new Map<string, { storeId: string; productId: string }>();
    const mixedPackages: PricedPackage[] = [];
    if (options.onMixedPlan) for (const store of stores) {
      if (unavailableReasons.has(store.id)) continue;
      for (const packages of packagesByStore.get(store.id)!.values()) for (const item of packages) {
        const id = JSON.stringify([store.id, item.product.id]);
        mixedIdentity.set(id, { storeId: store.id, productId: item.product.id });
        mixedPackages.push({ ...item, product: { ...item.product, id } });
      }
    }
    const mixedCache = new Map<string, MixedStorePlan["lines"] | null>();
    function mixedFor(requirements: IngredientRequirement[]): MixedStorePlan["lines"] | null {
      const lines: MixedStorePlan["lines"] = [];
      for (const item of requirements) {
        const key = `${item.ingredientId}:${item.quantity}:${item.unit}`;
        if (!mixedCache.has(key)) {
          const purchases = exactPurchase(item, mixedPackages);
          mixedCache.set(key, purchases?.map(line => ({ ...line, ...mixedIdentity.get(line.productId)! })) ?? null);
        }
        const purchases = mixedCache.get(key);
        if (!purchases) return null;
        lines.push(...purchases);
      }
      return lines;
    }
    function totalNutrition(requirements: IngredientRequirement[]): Nutrition {
      const nutrition = emptyNutrition();
      for (const item of requirements) {
        const ingredient = ingredientById.get(item.ingredientId)!;
        for (const key of Object.keys(nutrition) as (keyof Nutrition)[]) nutrition[key] += ingredient.nutrition.values[key] * item.quantity / ingredient.nutrition.basisQuantity;
      }
      for (const key of Object.keys(nutrition) as (keyof Nutrition)[]) nutrition[key] = Math.round(nutrition[key] * 10) / 10;
      return nutrition;
    }
    interface RankedPlan { meals: Recipe[]; requirements: IngredientRequirement[]; nutrition: Nutrition; score: number; signature: string; cost: number; tieId: string }
    interface Candidate extends RankedPlan { baskets: RepricedBasket<B>[]; recommended: CompleteBasket<B> }
    interface MixedCandidate extends RankedPlan { baskets: RepricedBasket<B>[]; lines: MixedStorePlan["lines"] }
    function rank(meals: Recipe[], requirements: IngredientRequirement[], lines: BasketLine[], amountCents: number, signature: string, tieId: string): RankedPlan {
      const nutrition = totalNutrition(requirements);
      const servings = preferences.mealCount * preferences.servingsPerMeal;
      const protein = nutrition.proteinG / servings / 40;
      const nutrientScore = protein * .7 + nutrition.fiberG / servings / 12 * .3;
      const variety = new Set(meals.map(recipe => recipe.id)).size / meals.length;
      const leftover = requirements.reduce((sum, item) => {
        const purchases = lines.filter(line => line.ingredientId === item.ingredientId);
        return sum + purchases.reduce((value, line) => value + line.leftover.quantity, 0) / purchases.reduce((value, line) => value + line.purchased.quantity, 0);
      }, 0) / requirements.length;
      const reuse = requirements.filter(item => meals.filter(recipe => recipe.ingredients.some(ingredient => ingredient.ingredientId === item.ingredientId)).length > 1).length / requirements.length;
      const cost = amountCents / preferences.weeklyBudget.amountCents;
      const proteinBonus = preferences.nutritionPriorities.includes("high-protein") ? protein * .15 : 0;
      const score = preferences.objective === "minimize-cost" ? amountCents
        : preferences.objective === "maximize-nutrition" ? -nutrientScore - proteinBonus + cost * .05 + leftover * .03 - variety * .03
        : cost * .55 - nutrientScore * .25 - variety * .1 + leftover * .07 - reuse * .03 - proteinBonus;
      return { meals, requirements, nutrition, score, signature, cost: amountCents, tieId };
    }
    function better(candidate: RankedPlan, previous: RankedPlan | null): boolean {
      if (!previous) return true;
      if (Math.abs(candidate.score - previous.score) > 1e-9) return candidate.score < previous.score;
      if (preferences.objective === "minimize-cost" && preferences.nutritionPriorities.includes("high-protein") && candidate.nutrition.proteinG !== previous.nutrition.proteinG) return candidate.nutrition.proteinG > previous.nutrition.proteinG;
      return candidate.cost < previous.cost || (candidate.cost === previous.cost && (candidate.signature < previous.signature
        || (candidate.signature === previous.signature && candidate.tieId < previous.tieId)));
    }
    let best: Candidate | null = null;
    let bestMixed: MixedCandidate | null = null;
    let minimumKnown = Infinity;
    const seen = new Set<string>();
    for (const generated of candidates(eligible, preferences.mealCount)) {
      const meals = [...generated].sort((a, b) => a.id.localeCompare(b.id, "en"));
      const signature = meals.map(recipe => recipe.id).join("|");
      if (seen.has(signature)) continue;
      if (evaluatedCombinations >= limit) { exhaustive = false; break; }
      seen.add(signature); evaluatedCombinations++;
      const requirements = aggregateRequirements(meals, preferences.servingsPerMeal);
      const baskets = basketsFor(requirements);
      const recommended = baskets.filter((basket): basket is CompleteBasket<B> => basket.status === "complete")
        .sort((a, b) => a.total.amountCents - b.total.amountCents || a.storeId.localeCompare(b.storeId, "en"))[0];
      if (recommended) {
        minimumKnown = Math.min(minimumKnown, recommended.total.amountCents);
        if (recommended.total.amountCents <= preferences.weeklyBudget.amountCents) {
          const ranked = rank(meals, requirements, recommended.lines, recommended.total.amountCents, signature, recommended.storeId);
          if (better(ranked, best)) best = { ...ranked, baskets, recommended };
        }
      }
      if (options.onMixedPlan) {
        const lines = mixedFor(requirements);
        if (lines && moneyTotal(lines) <= preferences.weeklyBudget.amountCents) {
          const ranked = rank(meals, requirements, lines, moneyTotal(lines), signature, lines.map(line => `${line.storeId}:${line.productId}`).join("|"));
          if (better(ranked, bestMixed)) bestMixed = { ...ranked, baskets, lines };
        }
      }
    }
    if (packageSearchTruncated) { exhaustive = false; notices.push("Some exact package searches reached their calculation limit. This run cannot establish optimality or infeasibility."); }
    if (bestMixed) {
      const winner = bestMixed;
      const compared = winner.baskets.filter((basket): basket is CompleteBasket<B> => basket.status === "complete")
        .sort((a, b) => a.total.amountCents - b.total.amountCents || a.storeId.localeCompare(b.storeId, "en"))[0];
      options.onMixedPlan?.({ basis, optimality: exhaustive ? "proven" : "best-found", lines: winner.lines,
        meals: winner.meals.map((recipe, slot) => ({ slot, recipeId: recipe.id, servings: preferences.servingsPerMeal })),
        requirements: winner.requirements, estimatedTotalNutrition: winner.nutrition,
        total: { amountCents: winner.cost, currency }, budgetRemaining: { amountCents: preferences.weeklyBudget.amountCents - winner.cost, currency },
        stores: [...new Set(winner.lines.map(line => line.storeId))].sort().map(storeId => ({ storeId, total: { amountCents: moneyTotal(winner.lines.filter(line => line.storeId === storeId)), currency } })),
        savings: compared ? { comparedToStoreId: compared.storeId, amount: { amountCents: compared.total.amountCents - winner.cost, currency } } : null });
      notices.push("A separately optimized complete mixed-store plan is included. Its meals can differ from the single-store plan; only identical-plan complete baskets support its savings. Travel, taxes and fees are excluded.");
    } else options.onMixedPlan?.(null);
    if (!best) {
      if (!exhaustive) return { ...base(), status: "incomplete", reason: "search-limit", message: "The search limit was reached without finding a fully priced plan within your budget. Other combinations may still work." };
      return { ...base(), status: "infeasible", reason: Number.isFinite(minimumKnown) ? "budget" : "pricing-unavailable",
        message: Number.isFinite(minimumKnown) ? "No fully priced plan in this catalog fits the selected budget." : "Ingredient prices unavailable. No plan in this catalog has complete ingredient pricing at any selected store. Choose other stores.",
        minimumKnownCost: Number.isFinite(minimumKnown) ? { amountCents: minimumKnown, currency } : null };
    }
    const winner = best;
    const ingredientReuse: IngredientReuse[] = winner.requirements.flatMap(item => {
      const usedBy = winner.meals.filter(recipe => recipe.ingredients.some(ingredient => ingredient.ingredientId === item.ingredientId));
      if (usedBy.length < 2) return [];
      const separate: BasketLine[] = [];
      // This optional explanation must not invalidate a complete, ranked basket.
      // Its independent baseline does not participate in the candidate search.
      for (const recipe of usedBy) {
        const requirement = aggregateRequirements([recipe], preferences.servingsPerMeal).find(requirement => requirement.ingredientId === item.ingredientId)!;
        try {
          const lines = purchasePackages(item.ingredientId, requirement, packagesByStore.get(winner.recommended.storeId)?.get(item.ingredientId) ?? [], currency);
          if (!lines) return [];
          separate.push(...lines);
        } catch (error) {
          if (!(error instanceof PackageSearchLimitError)) throw error;
          const notice = "Some ingredient-reuse savings could not be calculated within the comparison limit and are omitted. Basket totals are unaffected.";
          if (!notices.includes(notice)) notices.push(notice);
          return [];
        }
      }
      const consolidated = winner.recommended.lines.filter(line => line.ingredientId === item.ingredientId);
      return [{ ingredientId: item.ingredientId, recipeIds: item.usedByRecipeIds, packagesAvoided: Math.max(0, packageTotal(separate) - packageTotal(consolidated)),
        estimatedSavings: { amountCents: Math.max(0, moneyTotal(separate) - moneyTotal(consolidated)), currency } }];
    });
    const alternative = winner.baskets.filter((basket): basket is CompleteBasket<B> => basket.status === "complete" && basket.storeId !== winner.recommended.storeId)
      .sort((a, b) => a.total.amountCents - b.total.amountCents || a.storeId.localeCompare(b.storeId, "en"))[0];
    return { ...base(), status: "feasible", optimality: exhaustive ? "proven" : "best-found",
      meals: winner.meals.map((recipe, slot) => ({ slot, recipeId: recipe.id, servings: preferences.servingsPerMeal })),
      requirements: winner.requirements, estimatedTotalNutrition: winner.nutrition, baskets: winner.baskets,
      recommendedStoreId: winner.recommended.storeId, total: winner.recommended.total,
      budgetRemaining: { amountCents: preferences.weeklyBudget.amountCents - winner.recommended.total.amountCents, currency }, ingredientReuse,
      basketSavings: alternative ? { comparedToStoreId: alternative.storeId, amount: { amountCents: alternative.total.amountCents - winner.recommended.total.amountCents, currency } } : null,
      explanations: ["All required ingredients, including pantry oil, are purchased as whole packages at one store.",
        `The recommended store has the lowest complete ${basis === "verified" ? "observed-price" : "illustrative"} basket among your selected stores for this plan.`,
        "Shared ingredients are combined before package rounding. Leftovers estimate unused package contents, not measured food waste.",
        exhaustive ? "Search completed over the eligible catalog recipe combinations, including repeats." : "This is the best plan found within the deterministic search limit; other combinations may score better."] };
  };
}
export const optimizationEngine = createOptimizationEngine();
