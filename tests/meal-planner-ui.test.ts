// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealPlanner } from "@/components/meal-planner";
import type { GeneratedMeal, MealGenerationRequest, MealPlanResult } from "@/contracts/meal-plan";
import type { Country, GoogleStore, StoreDiscoveryRequest, StoreDiscoveryResult } from "@/contracts";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const submitted: MealGenerationRequest[] = [];
const discovered: StoreDiscoveryRequest[] = [];
const names = ["Lemon Rice Bowl", "Tomato Rice Skillet", "Garden Rice Soup"];

// Synthetic discovery transport fixtures, never presented as real nearby stores.
function fixtureStore(country: Country, unsupported = false): GoogleStore {
  return {
    id: unsupported ? "google:test-local-market" : `google:test-walmart-${country.toLowerCase()}`,
    name: unsupported ? "Test Local Market" : country === "CA" ? "Walmart Supercentre" : "Walmart Supercenter",
    address: "Synthetic test address", country, chainId: unsupported ? null : country === "CA" ? "ca-walmart" : "us-walmart",
    pricing: { status: "unavailable", profileId: null }, source: "google", googlePlaceId: "test-place-id",
    coordinates: { latitude: 43, longitude: -79 }, distanceMeters: 1200,
    googleMapsUri: "https://maps.google.com/?cid=test-place-id",
  };
}
function fixtureDiscovery(request: StoreDiscoveryRequest, stores = [fixtureStore(request.location.country), fixtureStore(request.location.country, true)]): StoreDiscoveryResult {
  return { mode: "live", location: { ...request.location, currency: request.location.country === "CA" ? "CAD" : "USD" },
    origin: { label: "Synthetic origin", coordinates: { latitude: 43, longitude: -79 } }, radiusKm: request.radiusKm,
    stores, attributions: [], notices: [] };
}

// Transport fixtures only. These recipes are never imported by or served in the app.
function fixtureMeal(index: number, servings: number, swap = false): GeneratedMeal {
  return {
    id: swap ? "chickpea-rice-plate" : `test-meal-${index}`,
    name: swap ? "Chickpea Rice Plate" : names[index] ?? `Vegetable rice ${index}`,
    description: "A structured test recipe.", servings, prepMinutes: 20, dietaryCategory: "vegan",
    instructions: ["Cook the rice.", "Combine the ingredients and serve."],
    ingredients: [
      { id: "rice", name: "Rice", quantity: swap ? 200 : 100 + index * 50, unit: "g", preparation: "dry", category: "grains" },
      { id: "onion", name: "Onion", quantity: index + 1, unit: "each", preparation: "as-sold", category: "produce" },
      { id: "olive-oil", name: "Olive oil", quantity: 10, unit: "ml", preparation: "as-sold", category: "pantry" },
      ...(swap ? [{ id: "chickpeas", name: "Chickpeas", quantity: 300, unit: "g" as const, preparation: "drained" as const, category: "protein" as const }] : []),
    ],
  };
}
function fixtureResult(request: MealGenerationRequest): MealPlanResult {
  const swap = request.mealCount === 1 && request.avoidMealNames.length > 0;
  return { source: "gemini", model: "gemini-3.5-flash-lite", notices: ["AI recipes; prices unavailable."],
    meals: Array.from({ length: request.mealCount }, (_, index) => fixtureMeal(index, request.householdSize, swap)) };
}
async function transport(path: string, init: RequestInit): Promise<Response> {
  if (path === "/api/stores") {
    const request = JSON.parse(String(init.body)) as StoreDiscoveryRequest;
    discovered.push(request);
    return Response.json({ ok: true, data: fixtureDiscovery(request) });
  }
  if (path !== "/api/meals") throw new Error(`Unexpected request: ${path}`);
  const request = JSON.parse(String(init.body)) as MealGenerationRequest;
  submitted.push(request);
  return Response.json({ ok: true, data: fixtureResult(request) });
}
const fetchMock = vi.fn(transport);

beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  submitted.length = 0;
  discovered.length = 0;
  fetchMock.mockClear();
  fetchMock.mockImplementation(transport);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`Missing control: ${selector}`);
  return found;
}
async function click(selector: string) { await act(async () => element(selector).click()); }
async function button(text: string) {
  const found = [...host.querySelectorAll("button")].find(item => item.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  await act(async () => found.click());
}
async function input(selector: string, value: string) {
  const control = element<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() { await act(async () => element("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function location(country: "CA" | "US" = "CA") {
  await act(async () => root.render(createElement(MealPlanner)));
  if (country === "US") await click('.country-option:nth-child(2) input');
  await input("#meal-postal", country === "CA" ? "l2r3a1" : "14201");
  await submit();
}
async function preferences(country: "CA" | "US" = "CA", unsupported = false) {
  await location(country);
  await click(`input[name="meal-store"][value="${fixtureStore(country, unsupported).id}"]`);
  await button("Continue with this store");
  expect(element("h1").textContent).toBe("Who’s at your table?");
}
async function plan(country: "CA" | "US" = "CA", unsupported = false) {
  await preferences(country, unsupported);
  await input("#meal-count", "2");
  await submit();
  expect(element("h1").textContent).toBe("Your week, made easier.");
}
function grocery(name: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>(".meal-shopping-row")].find(row => row.querySelector("strong")?.textContent === name);
  if (!found) throw new Error(`Missing grocery: ${name}`);
  return found;
}

describe("real meal-planning interface", () => {
  it("keeps invalid Canadian and US locations out of generation", async () => {
    await act(async () => root.render(createElement(MealPlanner)));
    await input("#meal-postal", "14201"); await submit();
    expect(element('[role="alert"]').textContent).toContain("Canadian postal code");
    expect(element("h1").textContent).toBe("Where’s your kitchen?");
    await click('.country-option:nth-child(2) input');
    expect(element<HTMLInputElement>("#meal-postal").value).toBe("");
    await input("#meal-postal", "L2R 3A1"); await submit();
    expect(element('[role="alert"]').textContent).toContain("ZIP");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["CA", "US"] as const)("submits %s region, native sliders and dietary choices to the meal endpoint", async country => {
    await preferences(country);
    expect(element<HTMLInputElement>("#meal-household").type).toBe("range");
    await input("#meal-household", "4");
    expect(host.querySelectorAll(".meal-people .is-present")).toHaveLength(4);
    await input("#meal-budget", "125");
    await input("#meal-count", "2");
    await button("Vegetarian"); await button("Extra protein"); await button("Peanuts");
    await submit();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/stores", "/api/meals"]);
    expect(discovered[0]).toMatchObject({ mode: "live", discoveryScope: "all-grocers", location: { country, postalCode: country === "CA" ? "L2R 3A1" : "14201" }, radiusKm: 10 });
    expect(submitted[0]).toMatchObject({
      location: { country, postalCode: country === "CA" ? "L2R 3A1" : "14201" },
      householdSize: 4, mealCount: 2, budget: { amountCents: 12_500, currency: country === "CA" ? "CAD" : "USD" },
      dietaryRestrictions: ["vegetarian"], excludedAllergens: ["peanuts"], highProtein: true,
    });
    expect(host.textContent).toContain("4 servings");
    expect(host.textContent).not.toContain("Exclude ingredients");
    await click("#shopping-tab");
    const links = [...host.querySelectorAll<HTMLAnchorElement>(".meal-retailer-links a")];
    expect(links.some(link => link.href.startsWith(country === "CA" ? "https://www.walmart.ca/" : "https://www.walmart.com/"))).toBe(true);
    expect(links.every(link => link.textContent?.startsWith("Search at"))).toBe(true);
    expect(links.every(link => link.href.startsWith(country === "CA" ? "https://www.walmart.ca/" : "https://www.walmart.com/"))).toBe(true);
    expect(host.textContent).toContain(fixtureStore(country).name);
    expect(host.textContent).toContain("Confirm branch, prices and pickup or delivery there");
  });

  it("consolidates quantities across recipes and copies only remaining groceries", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    await plan(); await click("#shopping-tab");
    expect(host.querySelectorAll(".meal-shopping-row")).toHaveLength(3);
    expect(grocery("Rice").textContent).toContain("250 g");
    expect(grocery("Onion").textContent).toContain("3 each");
    expect(grocery("Olive oil").textContent).toContain("20 ml");
    await act(async () => grocery("Onion").querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await button("Copy remaining");
    expect(clipboard.writeText).toHaveBeenCalledOnce();
    const copied = clipboard.writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("Rice — 250 g, dry");
    expect(copied).toContain("Olive oil — 20 ml");
    expect(copied).not.toContain("[ ] Onion");
    expect(element(".meal-copy-status").textContent).toContain("copied");
  });

  it("swaps only one meal and reopens checked groceries whose required quantity changed", async () => {
    await plan(); await click("#shopping-tab");
    for (const name of ["Rice", "Onion"]) await act(async () => grocery(name).querySelector<HTMLInputElement>("input")!.click());
    await click("#meals-tab");
    await click('button[aria-label="Swap Lemon Rice Bowl"]');
    expect(submitted[1]).toMatchObject({ mealCount: 1, avoidMealNames: ["Lemon Rice Bowl", "Tomato Rice Skillet"] });
    expect(submitted[1]).toMatchObject({ ingredientConventions: expect.arrayContaining([
      expect.objectContaining({ name: "Rice", unit: "g", preparation: "dry" }),
    ]) });
    const mealNames = [...host.querySelectorAll(".generated-meal h2")].map(heading => heading.textContent);
    expect(mealNames).toEqual(["Chickpea Rice Plate", "Tomato Rice Skillet"]);
    await click("#shopping-tab");
    expect(grocery("Rice").textContent).toContain("350 g");
    expect(grocery("Rice").querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(grocery("Onion").querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    expect(grocery("Chickpeas").textContent).toContain("300 g");
  });

  it("provides a selectable list when clipboard access fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) } });
    await plan(); await click("#shopping-tab"); await button("Copy remaining");
    const fallback = element<HTMLTextAreaElement>("#meal-copy-text");
    expect(fallback.readOnly).toBe(true);
    expect(fallback.value).toContain("Rice — 250 g, dry");
    expect(element(".meal-copy-status").textContent).toContain("Select and copy");
  });

  it("downloads an actual regional text-list Blob and releases its temporary URL", async () => {
    await plan("US"); await click("#shopping-tab");
    vi.useFakeTimers();
    const createObjectURL = vi.fn<(object: Blob) => string>(() => "blob:shopmate-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const downloads: { filename: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ filename: this.download, href: this.href });
    });
    await button("Download .txt");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe("text/plain;charset=utf-8");
    expect(downloads).toEqual([{ filename: "shopmate-groceries-us.txt", href: "blob:shopmate-test" }]);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:shopmate-test");
  });

  it("cancels a pending request and ignores a late provider success", async () => {
    let finish: ((response: Response) => void) | undefined;
    let pendingRequest: MealGenerationRequest | undefined;
    await preferences();
    fetchMock.mockImplementationOnce(async (_path, init) => {
      pendingRequest = JSON.parse(String(init.body)) as MealGenerationRequest;
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    await submit();
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    await button("Cancel");
    expect(element("h1").textContent).toBe("Who’s at your table?");
    expect(finish).toBeTypeOf("function");
    await act(async () => finish!(Response.json({ ok: true, data: fixtureResult(pendingRequest!) })));
    expect(host.querySelectorAll(".generated-meal")).toHaveLength(0);
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("shows provider failure without creating fixture meals or repeated calls", async () => {
    await preferences();
    fetchMock.mockImplementation(async () => Response.json({ ok: false, error: { code: "provider-not-configured", message: "Gemini is unavailable. Configure the server key." } }, { status: 503 }));
    await submit();
    expect(element('[role="alert"]').textContent).toContain("Gemini is unavailable");
    expect(host.querySelectorAll(".generated-meal")).toHaveLength(0);
    expect(host.querySelectorAll(".meal-shopping-row")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(host.textContent).not.toContain("fictional");
  });

  it("keeps an unsupported selected grocer with the list without substituting retailer searches", async () => {
    await plan("CA", true); await click("#shopping-tab");
    expect(host.textContent).toContain("Test Local Market");
    expect(host.querySelectorAll(".meal-retailer-links a")).toHaveLength(0);
    const mapsLinks = [...host.querySelectorAll<HTMLAnchorElement>("a")].filter(link => link.href.includes("google.com"));
    expect(mapsLinks.length).toBeGreaterThan(0);
    expect(host.textContent).not.toContain("Search at Walmart");
  });

  it("requires an explicit regional choice after discovery failure and still generates usable meals", async () => {
    fetchMock.mockImplementation(async (path, init) => path === "/api/stores"
      ? Response.json({ ok: false, error: { code: "provider-error", message: "Store lookup is unavailable." } }, { status: 502 })
      : transport(path, init));
    await location();
    expect(element('[role="alert"]').textContent).toContain("Store lookup is unavailable");
    expect(host.querySelectorAll('input[name="meal-store"]')).toHaveLength(0);
    expect(submitted).toHaveLength(0);
    expect(host.querySelector(".meal-preferences")).toBeNull();
    expect(host.textContent).not.toContain("fictional");
    await button("Continue with regional shopping links");
    await input("#meal-count", "2"); await submit(); await click("#shopping-tab");
    expect(submitted).toHaveLength(1);
    expect(host.querySelectorAll(".meal-retailer-links a").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("Regional");
    expect(host.textContent).not.toContain("Selected grocer:");
  });

  it("retries empty discovery at the chosen radius without ever substituting sample stores", async () => {
    fetchMock.mockImplementation(async (path, init) => {
      if (path !== "/api/stores") return transport(path, init);
      const request = JSON.parse(String(init.body)) as StoreDiscoveryRequest;
      discovered.push(request);
      return Response.json({ ok: true, data: fixtureDiscovery(request, []) });
    });
    await location();
    expect(host.textContent).toContain("No grocers returned nearby");
    expect(element<HTMLButtonElement>(".flow-actions .button-primary").disabled).toBe(true);
    await input("#meal-store-radius", "25"); await button("Search again");
    expect(discovered.map(request => request.radiusKm)).toEqual([10, 25]);
    expect(host.querySelectorAll('input[name="meal-store"]')).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });

  it("clears selected stores and meals when the location changes", async () => {
    await plan();
    await click(".meal-progress li:first-child button");
    await click('.country-option:nth-child(2) input');
    expect(element<HTMLInputElement>("#meal-postal").value).toBe("");
    await input("#meal-postal", "14201"); await submit();
    const checkedStore = host.querySelector('input[name="meal-store"]:checked');
    expect(checkedStore).toBeNull();
    expect(host.querySelectorAll(".generated-meal")).toHaveLength(0);
    expect(host.querySelector('input[value="google:test-walmart-ca"]')).toBeNull();
    expect(discovered.map(request => request.location.country)).toEqual(["CA", "US"]);
  });

  it("changes the selected store without regenerating the existing meals", async () => {
    await plan();
    const originalNames = [...host.querySelectorAll(".generated-meal h2")].map(heading => heading.textContent);
    await click(".meal-progress li:nth-child(2) button");
    await click('input[name="meal-store"][value="google:test-local-market"]');
    await button("Continue with this store");
    expect([...host.querySelectorAll(".generated-meal h2")].map(heading => heading.textContent)).toEqual(originalNames);
    expect(submitted).toHaveLength(1);
    await click("#shopping-tab");
    expect(host.textContent).toContain("Test Local Market");
    expect(host.querySelectorAll(".meal-retailer-links a")).toHaveLength(0);
  });

  it("rejects a demo discovery response to a live location search", async () => {
    fetchMock.mockImplementation(async (_path, init) => {
      const request = JSON.parse(String(init.body)) as StoreDiscoveryRequest;
      return Response.json({ ok: true, data: { ...fixtureDiscovery(request), mode: "demo" } });
    });
    await location();
    expect(element('[role="alert"]').textContent).toContain("didn’t match your location");
    expect(host.querySelectorAll('input[name="meal-store"]')).toHaveLength(0);
    expect(host.querySelector(".meal-preferences")).toBeNull();
    expect(submitted).toHaveLength(0);
  });

  it("ignores late discovery after navigating back and changing country", async () => {
    let finish: ((response: Response) => void) | undefined;
    let pending: StoreDiscoveryRequest | undefined;
    fetchMock.mockImplementationOnce(async (_path, init) => {
      pending = JSON.parse(String(init.body)) as StoreDiscoveryRequest;
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    await location();
    expect(host.textContent).toContain("Finding your nearby grocers");
    await button("Back"); await click('.country-option:nth-child(2) input');
    await act(async () => finish!(Response.json({ ok: true, data: fixtureDiscovery(pending!) })));
    expect(element("h1").textContent).toBe("Where’s your kitchen?");
    expect(element<HTMLInputElement>("#meal-postal").value).toBe("");
    expect(host.querySelectorAll('input[name="meal-store"]')).toHaveLength(0);
    expect(host.textContent).not.toContain("Walmart Supercentre");
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
