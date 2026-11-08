// @vitest-environment jsdom
import { act, createElement } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Planner } from "@/components/planner";
import { StoreLogo } from "@/components/store-logo";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { POST as discover } from "@/app/api/v2/stores/route";
import { POST as pricing } from "@/app/api/v2/pricing/route";
import { POST as optimize } from "@/app/api/v2/optimize/route";
import { jsonRequest } from "./fixtures";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const submitted: { path: string; body: unknown }[] = [];

beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  submitted.length = 0;
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const body: unknown = JSON.parse(String(init.body));
    submitted.push({ path: input, body });
    const request = jsonRequest(input, body);
    if (input === "/api/v2/stores") return discover(request);
    if (input === "/api/v2/pricing") return pricing(request);
    if (input === "/api/v2/optimize") return optimize(request);
    throw new Error(`Unexpected request: ${input}`);
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`Missing control: ${selector}`);
  return found;
}
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function click(selector: string) { await act(async () => element(selector).click()); }
async function button(text: string) {
  const found = [...host.querySelectorAll("button")].find(item => item.textContent?.startsWith(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  await act(async () => found.click());
}
async function submit() { await act(async () => element("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function input(selector: string, value: string) {
  const control = element<HTMLInputElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function preferences(country: "CA" | "US") {
  await render(createElement(Planner, { catalogVersion: CATALOG_VERSION, recipes, ingredients, products, initialMode: "demo", initialCountry: country }));
  await submit();
  expect(element("h1").textContent).toBe("Your grocery go-tos");
  await click('.store-choice input[type="checkbox"]');
  await button("Continue");
  expect(element("h1").textContent).toBe("Make it yours.");
}

describe("interactive visual setup against the actual demo routes", () => {
  it.each(["CA", "US"] as const)("submits %s choices unchanged through the redesigned controls, back navigation and a complete plan", async country => {
    await preferences(country);
    await click('input[name="household"][value="8"]');
    expect(host.querySelectorAll(".person-seat.is-present")).toHaveLength(8);
    await click('input[name="household"][value="3"]');
    expect(host.querySelectorAll(".person-seat.is-present")).toHaveLength(3);
    await input("#budget-slider", "132");
    expect(element<HTMLInputElement>("#budget").value).toBe("132.00");
    expect(element(".budget-readout output").textContent).toBe("$132");
    await input("#budget", "87.35");
    expect(element(".budget-readout output").textContent).toBe("$87.35");
    await click('button[aria-label="Vegan"]');
    await click('button[aria-label="Exclude peanuts"]');
    await click('button[aria-label="Exclude milk"]');
    await click('button[aria-label="Extra protein"]');
    expect(element('button[aria-label="Extra protein"]').getAttribute("aria-pressed")).toBe("true");
    await submit();
    expect(element("h1").textContent).toBe("A week of good food.");
    await click('input[name="meal-count"][value="2"]');
    await click('input[name="objective"][value="minimize-cost"]');
    await click('button[aria-label="3. Preferences"]');
    expect(element<HTMLInputElement>("#budget").value).toBe("87.35");
    expect(element<HTMLInputElement>('input[name="household"][value="3"]').checked).toBe(true);
    expect(element('button[aria-label="Vegan"]').getAttribute("aria-pressed")).toBe("true");
    expect(element('button[aria-label="Exclude peanuts"]').getAttribute("aria-pressed")).toBe("true");
    await submit();
    expect(element<HTMLInputElement>('input[name="meal-count"][value="2"]').checked).toBe(true);
    await button("Create plan");
    expect(submitted.find(item => item.path === "/api/v2/optimize")?.body).toMatchObject({
      mode: "demo", country, preferences: { weeklyBudget: { amountCents: 8735, currency: country === "CA" ? "CAD" : "USD" },
        servingsPerMeal: 3, mealCount: 2, dietaryRestrictions: ["vegan"], excludedAllergens: ["peanuts", "milk"], nutritionPriorities: ["high-protein"], objective: "minimize-cost" },
    });
    expect(element("h1").textContent).toBe("Your meals");
    expect(host.querySelectorAll(".meal-detail")).toHaveLength(2);
    expect(host.textContent).toContain("Illustrative prices");
    expect(document.activeElement?.id).toBe("screen-title");
  });

  it("blocks invalid exact budgets, focuses the field and permits an exact cent without rounding it away", async () => {
    await preferences("CA");
    for (const value of ["0", "1.234", "10000.01", ""]) {
      await input("#budget", value); await submit();
      expect(element("h1").textContent).toBe("Make it yours.");
      expect(element<HTMLInputElement>("#budget").getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement?.id).toBe("budget");
      expect(submitted.some(item => item.path === "/api/v2/optimize")).toBe(false);
    }
    await input("#budget", "0.01"); await submit();
    expect(element("h1").textContent).toBe("A week of good food.");
    expect(host.textContent?.replace(/\s+/g, " ")).toContain("CAD 0.01");
  });

  it("deselects visual choices without leaving stale hard restrictions or protein priority", async () => {
    await preferences("US");
    for (const label of ["Vegan", "Exclude peanuts", "Extra protein"]) {
      await click(`button[aria-label="${label}"]`);
      expect(element(`button[aria-label="${label}"]`).getAttribute("aria-pressed")).toBe("true");
      await click(`button[aria-label="${label}"]`);
      expect(element(`button[aria-label="${label}"]`).getAttribute("aria-pressed")).toBe("false");
    }
    await submit(); await click('input[name="meal-count"][value="1"]'); await button("Create plan");
    expect(submitted.find(item => item.path === "/api/v2/optimize")?.body).toMatchObject({ preferences: { dietaryRestrictions: [], excludedAllergens: [], nutritionPriorities: [] } });
  });
});

describe("retailer image lifecycle", () => {
  it("keeps the local fallback during loading and after an image error without repeated requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", "test-client");
    const store = { name: "Loblaws", country: "CA" as const, source: "google" as const, chainId: null };
    await render(createElement(StoreLogo, { store }));
    expect(element(".retailer-fallback").textContent).toBe("L");
    expect(element("img").classList.contains("is-loaded")).toBe(false);
    await act(async () => element("img").dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(element(".retailer-fallback").textContent).toBe("L");
    await render(createElement(StoreLogo, { store: { ...store, name: "Ken’s No Frills" } }));
    expect(element<HTMLImageElement>("img").src).toContain("/domain/nofrills.ca/");
    await act(async () => element("img").dispatchEvent(new Event("load")));
    expect(element("img").classList.contains("is-loaded")).toBe(true);
  });
});
