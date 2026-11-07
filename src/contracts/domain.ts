/** All amounts are integer minor currency units. Never compare CAD with USD. */
export type Country = "CA" | "US";
export type Currency = "CAD" | "USD";
export type DataMode = "demo" | "live";
export interface Money { amountCents: number; currency: Currency }
export interface LocationInput { country: Country; postalCode: string }
export interface NormalizedLocation extends LocationInput { currency: Currency }
export interface Coordinates { latitude: number; longitude: number }

export type ChainId =
  | "ca-loblaws" | "ca-no-frills" | "ca-walmart"
  | "us-aldi" | "us-kroger" | "us-walmart";
export type PricingProfileId = ChainId
  | "demo-ca-cedar" | "demo-ca-clover" | "demo-ca-orchard"
  | "demo-us-cedar" | "demo-us-clover" | "demo-us-orchard";
export type PricingAvailability =
  | { status: "illustrative"; profileId: PricingProfileId }
  | { status: "unavailable"; profileId: null };

interface StoreBase {
  id: string;
  name: string;
  address: string;
  country: Country;
  chainId: ChainId | null;
  pricing: PricingAvailability;
}
export interface DemoStore extends StoreBase {
  source: "demo";
  googlePlaceId: null;
  coordinates: null;
  distanceMeters: null;
  googleMapsUri: null;
}
export interface GoogleStore extends StoreBase {
  source: "google";
  googlePlaceId: string;
  coordinates: Coordinates;
  /** Straight-line distance from the geocoded origin, not driving distance. */
  distanceMeters: number;
  googleMapsUri: string;
}
export type Store = DemoStore | GoogleStore;
export interface Attribution {
  provider: "google-maps";
  displayName: string;
  uri: string;
}

/** Ingredients and packages share canonical units; no implicit density conversion. */
export type Unit = "g" | "ml" | "each";
export interface Quantity { quantity: number; unit: Unit }
export type Diet = "vegetarian" | "vegan" | "gluten-free";
export type Allergen = "milk" | "egg" | "fish" | "shellfish" | "tree-nuts"
  | "peanuts" | "wheat" | "soy" | "sesame";
export type IngredientCategory = "produce" | "grains" | "proteins" | "dairy" | "pantry";
export interface Nutrition {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}
export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: Unit;
  diets: Diet[];
  allergens: Allergen[];
  /** Values are estimates per basisQuantity in the ingredient's canonical unit. */
  nutrition: { basisQuantity: number; values: Nutrition; basis: "estimated" };
}
export interface RecipeIngredient extends Quantity { ingredientId: string }
export interface Recipe {
  id: string;
  name: string;
  description: string;
  servings: number;
  totalMinutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  diets: Diet[];
  allergens: Allergen[];
  nutritionPerServing: Nutrition;
  nutritionBasis: "estimated";
  illustration: "grain-bowl" | "soup" | "skillet";
}
export interface ProductPackage {
  id: string;
  ingredientId: string;
  name: string;
  label: string;
  /** Usable content: e.g. drained beans, dry rice, edible banana flesh. */
  content: Quantity;
  countries: Country[];
}
export interface PricingProfile {
  id: PricingProfileId;
  label: string;
  country: Country;
  currency: Currency;
  chainId: ChainId | null;
  basis: "illustrative";
}
export interface ProductOffer {
  productId: string;
  profileId: PricingProfileId;
  price: Money;
  basis: "illustrative";
  available: boolean;
}
export type StorePricingResult =
  | { status: "available"; storeId: string; basis: "illustrative"; offers: ProductOffer[] }
  | { status: "unavailable"; storeId: string; reason: string };

export interface Preferences {
  weeklyBudget: Money;
  mealCount: number;
  servingsPerMeal: number;
  dietaryRestrictions: Diet[];
  excludedIngredientIds: string[];
  excludedAllergens: Allergen[];
  nutritionPriorities: ("high-protein")[];
  objective: "minimize-cost" | "maximize-nutrition" | "balanced";
}
export interface PlannedMeal { slot: number; recipeId: string; servings: number }
export interface IngredientRequirement extends Quantity {
  ingredientId: string;
  usedByRecipeIds: string[];
}
export interface BasketLine {
  ingredientId: string;
  productId: string;
  required: Quantity;
  packageCount: number;
  purchased: Quantity;
  leftover: Quantity;
  unitPrice: Money;
  subtotal: Money;
}
export type BasketComparison =
  | { status: "complete"; storeId: string; lines: BasketLine[]; total: Money; basis: "illustrative" }
  | { status: "unavailable"; storeId: string; missingIngredientIds: string[]; reason: string };
export interface IngredientReuse {
  ingredientId: string;
  recipeIds: string[];
  /** Package savings against buying each meal's packages separately, same store. */
  packagesAvoided: number;
  estimatedSavings: Money;
}
export interface SearchSummary {
  evaluatedCombinations: number;
  exhaustive: boolean;
}
interface OptimizationBase {
  mode: DataMode;
  country: Country;
  currency: Currency;
  pricingBasis: "illustrative";
  search: SearchSummary;
  notices: string[];
}
export interface FeasibleOptimization extends OptimizationBase {
  status: "feasible";
  optimality: "proven" | "best-found";
  meals: PlannedMeal[];
  requirements: IngredientRequirement[];
  /** Sum over all servings in the plan, not per person or per day. */
  estimatedTotalNutrition: Nutrition;
  baskets: BasketComparison[];
  recommendedStoreId: string;
  total: Money;
  budgetRemaining: Money;
  ingredientReuse: IngredientReuse[];
  /** Difference from another complete selected-store basket for the same plan. */
  basketSavings: { comparedToStoreId: string; amount: Money } | null;
  explanations: string[];
}
export interface InfeasibleOptimization extends OptimizationBase {
  status: "infeasible";
  reason: "budget" | "dietary-constraints" | "pricing-unavailable";
  message: string;
  minimumKnownCost: Money | null;
}
/** A bounded search cannot claim infeasibility when it has not exhausted candidates. */
export interface IncompleteOptimization extends OptimizationBase {
  status: "incomplete";
  reason: "search-limit";
  message: string;
}
export type OptimizationResult = FeasibleOptimization | InfeasibleOptimization | IncompleteOptimization;
