import type { CSSProperties } from "react";
import type { Allergen, Currency, Diet, Preferences } from "@/contracts";
import { allergenSchema, dietSchema } from "@/contracts";
import { Icon } from "@/components/grocery-art";
import { FoodArt, PersonArt } from "@/components/preference-art";
import { budgetCents, toggleValue } from "@/lib/planner";

export const foodLabels: Record<Diet | Allergen, string> = {
  vegetarian: "Vegetarian", vegan: "Vegan", "gluten-free": "Gluten-free",
  milk: "Milk", egg: "Eggs", fish: "Fish", shellfish: "Shellfish", "tree-nuts": "Tree nuts",
  peanuts: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame",
};

export function HouseholdSelector({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <fieldset className="setup-panel household-panel">
    <legend className="sr-only">Household size</legend>
    <div className="panel-topline"><span>Who’s at your table?</span><output className="people-count" aria-live="polite" aria-label="Household size">{value} {value === 1 ? "person" : "people"}</output></div>
    <div className="people-stage" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <span className={`person-seat ${index < value ? "is-present" : ""}`} key={index}><PersonArt index={index} /></span>)}
      <span className="table-line" />
    </div>
    <div className="household-seats">{Array.from({ length: 8 }, (_, index) => {
      const count = index + 1;
      return <label className="seat-option" key={count}>
        <input className="sr-only" type="radio" name="household" value={count} checked={value === count} onChange={() => onChange(count)} aria-label={`${count} ${count === 1 ? "person" : "people"}`} />
        <span>{count}</span>
      </label>;
    })}</div>
  </fieldset>;
}

export function BudgetSelector({ value, currency, invalid, onChange }: { value: string; currency: Currency; invalid: boolean; onChange: (value: string) => void }) {
  const cents = budgetCents(value);
  // The slider is convenient in whole dollars; exact entry keeps every cent.
  const dollars = Math.max(1, Math.round((cents ?? 8000) / 100));
  const max = Math.max(300, Math.ceil(dollars / 100) * 100);
  const amount = cents === null ? "—" : new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

  return <section className="setup-panel budget-panel" aria-labelledby="budget-label">
    <div className="panel-topline"><label id="budget-label" htmlFor="budget-slider">Grocery budget</label><span className="currency-badge">{currency}</span></div>
    <div className="budget-readout"><output htmlFor="budget-slider budget" aria-live="polite">{amount}</output><span>for your plan</span><span className="budget-coin" aria-hidden="true"><Icon name="receipt" /></span></div>
    <input className="budget-slider" id="budget-slider" type="range" min={1} max={max} step={1} value={dollars} aria-valuetext={`${amount} ${currency}`}
      style={{ "--range-progress": `${((dollars - 1) / (max - 1)) * 100}%` } as CSSProperties} onChange={event => onChange(Number(event.target.value).toFixed(2))} />
    <div className="range-labels" aria-hidden="true"><span>$1</span><span>${max / 2}</span><span>${max}</span></div>
    <div className="budget-exact"><label htmlFor="budget">Exact amount</label><span>$ <input id="budget" inputMode="decimal" autoComplete="off" value={value} aria-invalid={invalid} aria-describedby="preference-error" onChange={event => onChange(event.target.value)} /></span></div>
  </section>;
}

function SelectionMark({ selected, exclude = false }: { selected: boolean; exclude?: boolean }) {
  return <span className="selection-mark" aria-hidden="true">{selected ? exclude ? "−" : <Icon name="check" /> : "+"}</span>;
}

export function FoodPreferences({ preferences, onChange }: { preferences: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  const protein = preferences.nutritionPriorities.includes("high-protein");
  return <>
    <fieldset className="visual-field">
      <legend>On your menu <span>Mix & match</span></legend>
      <div className="diet-card-grid">
        {dietSchema.options.map(diet => {
          const selected = preferences.dietaryRestrictions.includes(diet);
          return <button type="button" className={`food-card diet-card ${selected ? "is-selected" : ""}`} key={diet} aria-label={foodLabels[diet]} aria-pressed={selected} onClick={() => onChange({ dietaryRestrictions: toggleValue(preferences.dietaryRestrictions, diet) })}>
            <SelectionMark selected={selected} /><FoodArt name={diet} /><strong>{foodLabels[diet]}</strong>
          </button>;
        })}
        <button type="button" className={`food-card protein-card ${protein ? "is-selected" : ""}`} aria-pressed={protein} aria-label="Extra protein" onClick={() => onChange({ nutritionPriorities: protein ? [] : ["high-protein"] })}>
          <SelectionMark selected={protein} /><FoodArt name="protein" /><strong>Extra protein</strong><span className="food-card-caption">{protein ? "Let’s flex!" : "Prefer, if possible"}</span>
        </button>
      </div>
    </fieldset>
    <fieldset className="visual-field allergen-field">
      <legend>Keep off the plate <span>{preferences.excludedAllergens.length ? `${preferences.excludedAllergens.length} excluded` : "Any allergens?"}</span></legend>
      <div className="allergen-grid">{allergenSchema.options.map(allergen => {
        const selected = preferences.excludedAllergens.includes(allergen);
        return <button type="button" className={`food-card allergen-card ${selected ? "is-selected" : ""}`} key={allergen} aria-pressed={selected} aria-label={`Exclude ${foodLabels[allergen].toLowerCase()}`} onClick={() => onChange({ excludedAllergens: toggleValue(preferences.excludedAllergens, allergen) })}>
          <SelectionMark selected={selected} exclude /><FoodArt name={allergen} /><strong>{foodLabels[allergen]}</strong><span className="allergen-status">{selected ? "Excluded" : "\u00a0"}</span>
        </button>;
      })}</div>
      <p className="small-note">Excluded from recipes. Always check product labels.</p>
    </fieldset>
  </>;
}

export function MealCountSelector({ value, servings, onChange }: { value: number; servings: number; onChange: (value: number) => void }) {
  return <fieldset className="visual-field meal-count-field">
    <legend>How many meals? <output aria-live="polite">{value} meals · {value * servings} servings</output></legend>
    <div className="meal-count-grid">{Array.from({ length: 14 }, (_, index) => {
      const count = index + 1;
      return <label className={`meal-slot ${count <= value ? "is-filled" : ""}`} key={count}>
        <input className="sr-only" type="radio" name="meal-count" value={count} checked={value === count} onChange={() => onChange(count)} aria-label={`${count} ${count === 1 ? "meal" : "meals"}`} />
        <span className="meal-plate"><Icon name="bowl" /></span><span>{count}</span>
      </label>;
    })}</div>
  </fieldset>;
}

const objectives = [
  { value: "balanced", label: "A bit of everything", hint: "Your happy middle" },
  { value: "minimize-cost", label: "Spend less", hint: "Budget comes first" },
  { value: "maximize-nutrition", label: "Nourish more", hint: "Nutrition comes first" },
] as const;

export function ObjectiveSelector({ value, onChange }: { value: Preferences["objective"]; onChange: (value: Preferences["objective"]) => void }) {
  return <fieldset className="visual-field"><legend>Find your balance</legend>
    <div className="priority-grid">{objectives.map(objective => <label className="priority-card" key={objective.value}>
      <input className="sr-only" type="radio" name="objective" value={objective.value} checked={value === objective.value} onChange={() => onChange(objective.value)} />
      <SelectionMark selected={value === objective.value} /><FoodArt name={objective.value} /><strong>{objective.label}</strong><span>{objective.hint}</span>
    </label>)}</div>
  </fieldset>;
}
