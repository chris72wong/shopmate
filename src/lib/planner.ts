import type { Country, DataMode, OptimizationResult, Preferences, StoreDiscoveryResult } from "@/contracts";
import { currencyForCountry } from "@/contracts";

export interface PlannerState {
  step: number;
  mode: DataMode;
  country: Country | null;
  postalCode: string;
  radiusKm: number;
  discovery: StoreDiscoveryResult | null;
  storeIds: string[];
  preferences: Preferences;
  result: OptimizationResult | null;
}

export function initialPlanner(mode: DataMode = "live", country: Country | null = null): PlannerState {
  return { step: 1, mode, country, postalCode: "", radiusKm: 5,
    discovery: null, storeIds: [], result: null,
    preferences: { weeklyBudget: { amountCents: 8000, currency: currencyForCountry(country ?? "CA") },
      mealCount: 5, servingsPerMeal: 2, dietaryRestrictions: [], excludedIngredientIds: [],
      excludedAllergens: [], nutritionPriorities: [], objective: "balanced" } };
}

export type PlannerAction =
  | { type: "step"; step: number }
  | { type: "country"; country: Country }
  | { type: "location"; postalCode: string; radiusKm: number }
  | { type: "discovery"; data: StoreDiscoveryResult }
  | { type: "store"; id: string }
  | { type: "preferences"; preferences: Preferences }
  | { type: "result"; result: OptimizationResult }
  | { type: "clear-result" };

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "step": return { ...state, step: action.step };
    case "country": return action.country === state.country ? state : { ...state, country: action.country,
      postalCode: "", discovery: null, storeIds: [], result: null,
      preferences: { ...state.preferences, weeklyBudget: { ...state.preferences.weeklyBudget, currency: currencyForCountry(action.country) } } };
    case "location": return { ...state, postalCode: action.postalCode, radiusKm: action.radiusKm,
      discovery: null, storeIds: [], result: null };
    case "discovery": return { ...state, discovery: action.data, postalCode: action.data.mode === "live" ? action.data.location.postalCode : state.postalCode,
      storeIds: [], result: null };
    case "store": {
      if (!state.discovery?.stores.some(store => store.id === action.id)) return state;
      const selected = state.storeIds.includes(action.id);
      if (!selected && state.storeIds.length >= 3) return state;
      return { ...state, result: null, storeIds: selected ? state.storeIds.filter(id => id !== action.id) : [...state.storeIds, action.id] };
    }
    case "preferences": return { ...state, preferences: action.preferences, result: null };
    case "result": return { ...state, result: action.result };
    case "clear-result": return { ...state, result: null };
  }
}

export function budgetCents(value: string): number | null {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole = "", fractional = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return cents >= 1 && cents <= 1_000_000 ? cents : null;
}

export function safeExternalUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; }
  catch { return undefined; }
}

export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}
