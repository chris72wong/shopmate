import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { allergenSchema, dietSchema, preferencesSchema } from "@/contracts";
import { BudgetSelector, FoodPreferences, HouseholdSelector, MealCountSelector, ObjectiveSelector } from "@/components/preference-controls";
import { initialPlanner, plannerReducer } from "@/lib/planner";

const noop = () => undefined;
const checkedRadio = (html: string) => html.match(/<input\b[^>]*checked=""[^>]*>/g) ?? [];

describe("visual preferences preserve the supported contract", () => {
  it.each([1, 2, 8])("illustrates exactly %s active household members and exposes the complete native radio range", count => {
    const html = renderToStaticMarkup(createElement(HouseholdSelector, { value: count, onChange: noop }));
    expect(html.match(/person-seat is-present/g)).toHaveLength(count);
    expect(html.match(/type="radio"/g)).toHaveLength(8);
    expect(html).toContain('aria-label="1 person"');
    expect(html).toContain('aria-label="8 people"');
    expect(checkedRadio(html)).toHaveLength(1);
    expect(checkedRadio(html)[0]).toContain(`value="${count}"`);
    expect(html).toContain('aria-live="polite"');
  });

  it.each(["CAD", "USD"] as const)("offers a primary slider and exact %s budget entry, preserving cents", currency => {
    const html = renderToStaticMarkup(createElement(BudgetSelector, { value: "87.35", currency, invalid: false, onChange: noop }));
    expect(html).toContain('type="range"');
    expect(html).toContain('for="budget-slider"');
    expect(html).toContain('for="budget"');
    expect(html).toContain("87.35");
    expect(html).toContain(currency);
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('aria-invalid="false"');
  });

  it("extends the slider for a large exact budget and exposes invalid exact entry accessibly", () => {
    const html = renderToStaticMarkup(createElement(BudgetSelector, { value: "10000.00", currency: "CAD", invalid: false, onChange: noop }));
    expect(html).toContain('max="10000"');
    expect(html).toContain("$10,000");
    const invalid = renderToStaticMarkup(createElement(BudgetSelector, { value: "1.234", currency: "CAD", invalid: true, onChange: noop }));
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain('aria-describedby="preference-error"');
    expect(invalid).toContain('value="1.234"');
    expect(invalid).not.toContain("$1.23");
  });

  it("illustrates every actual dietary and allergen option without adding unsupported diets", () => {
    const html = renderToStaticMarkup(createElement(FoodPreferences, { preferences: initialPlanner().preferences, onChange: noop }));
    expect(html.match(/class="food-card diet-card /g)).toHaveLength(dietSchema.options.length);
    expect(html.match(/class="food-card allergen-card /g)).toHaveLength(allergenSchema.options.length);
    for (const option of [...dietSchema.options, ...allergenSchema.options]) expect(html).toContain(`food-art-${option}`);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(13);
    expect(html).not.toMatch(/Mediterranean|Keto|Paleo|<details|type="checkbox"/);
    expect(html).toContain("Always check product labels");
  });

  it("makes hard exclusions and the soft protein priority distinct and persists their canonical values", () => {
    const preferences = { ...initialPlanner().preferences, dietaryRestrictions: ["vegan" as const], excludedAllergens: ["milk" as const, "peanuts" as const], nutritionPriorities: ["high-protein" as const] };
    expect(preferencesSchema.safeParse(preferences).success).toBe(true);
    const html = renderToStaticMarkup(createElement(FoodPreferences, { preferences, onChange: noop }));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Exclude milk"');
    expect(html).toContain('aria-label="Extra protein"');
    expect(html.match(/>Excluded</g)).toHaveLength(2);
    expect(html).toContain("2 excluded");
    let state = plannerReducer(initialPlanner(), { type: "preferences", preferences });
    state = plannerReducer(state, { type: "step", step: 4 });
    state = plannerReducer(state, { type: "step", step: 3 });
    expect(state.preferences).toEqual(preferences);
  });

  it.each([1, 5, 14])("offers all 14 meal counts with %s included meal slots and a live serving total", value => {
    const html = renderToStaticMarkup(createElement(MealCountSelector, { value, servings: 3, onChange: noop }));
    expect(html.match(/type="radio"/g)).toHaveLength(14);
    expect(html.match(/meal-slot is-filled/g)).toHaveLength(value);
    expect(html).toContain(`${value * 3} servings`);
    expect(checkedRadio(html)).toHaveLength(1);
    expect(checkedRadio(html)[0]).toContain(`value="${value}"`);
  });

  it("keeps the three exact objective values in native, labeled radios", () => {
    const html = renderToStaticMarkup(createElement(ObjectiveSelector, { value: "minimize-cost", onChange: noop }));
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(checkedRadio(html)).toHaveLength(1);
    expect(checkedRadio(html)[0]).toContain('value="minimize-cost"');
    expect(html).toContain('value="balanced"');
    expect(html).toContain('value="maximize-nutrition"');
  });
});
