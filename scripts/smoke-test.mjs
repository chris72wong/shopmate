import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Exercise the built app over real HTTP. No API keys or browser installation required.
const probe = createServer();
await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
const address = probe.address();
assert(address && typeof address === "object");
const port = address.port;
await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", GOOGLE_MAPS_API_KEY: "", REEF_KEY: "", SHOPMATE_PRICING_STORES: "[]", SHOPMATE_PRICING_PRODUCTS: "[]" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let output = "";
let spawnError;
server.on("error", (error) => { spawnError = error; });
for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { output = (output + chunk.toString()).slice(-16_000); });
let checks = 0;
async function get(path, expectedStatus = 200) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, expectedStatus, `GET ${path}`); checks++;
  return response;
}
async function post(path, body, expectedStatus) {
  const response = await fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, expectedStatus, `POST ${path}`);
  assert.equal(response.headers.get("X-ShopMate-Contract-Version"), path.startsWith("/api/v2/") ? "2" : "1"); checks++;
  return response.json();
}
try {
  const deadline = Date.now() + 45_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
    try { const response = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(1000) }); ready = response.ok; }
    catch { /* Wait for readiness within the deadline. */ }
    if (ready) break;
    await delay(250);
  }
  assert(ready, `Production server did not become ready: ${output}`);
  const home = await (await get("/")).text();
  assert(home.includes("Good food."));
  assert(home.includes('href="/plan"'), "The homepage must link to the planner");
  assert(home.includes("Find your stores") && home.includes("Compare your options") && home.includes("Plan your meals"));
  assert(!home.includes("/photos/") && !home.includes("Photo credits"), "Replaced stock photos must not return");
  const planner = await (await get("/plan")).text();
  assert(planner.includes("Choose your country"));
  assert(planner.includes("Canada")); assert(planner.includes("United States"));
  const cssPath = home.match(/href="([^"]+\.css(?:\?[^"]*)?)"/)?.[1];
  assert(cssPath, "The home page must load generated CSS");
  const css = await (await get(cssPath.replaceAll("&amp;", "&"))).text();
  assert(/--forest:/.test(css) && /--cream:/.test(css), "Brand styles must be present in the production CSS");
  for (const country of ["CA", "US"]) {
    const page = await (await get(`/demo?country=${country}`)).text();
    assert(page.includes("fictional")); assert(page.includes(country === "CA" ? "CAD" : "USD"));
    const result = await post("/api/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "m5v2t6" : "02108" } }, 200);
    assert.equal(result.data.stores.length, 3); assert.equal(result.data.mode, "demo");
    assert(result.data.stores.every((store) => store.distanceMeters === null));
  }
  await get("/this-page-does-not-exist", 404);
  const health = await (await get("/api/health")).json(); assert.equal(health.data.capabilities.optimization, true);
  assert.equal(health.data.capabilities.liveDiscovery, true);
  await post("/api/stores", { mode: "live", location: { country: "US", postalCode: "14201" } }, 503);
  await post("/api/stores", { mode: "demo", location: { country: "CA", postalCode: "invalid" } }, 422);
  const malformed = await fetch(origin + "/api/stores", { method: "POST", body: "{", signal: AbortSignal.timeout(5000) });
  assert.equal(malformed.status, 400); checks++;
  const plan = await post("/api/optimize", {
    mode: "demo", country: "US", storeIds: ["demo-us-clover"], preferences: {
      weeklyBudget: { amountCents: 8000, currency: "USD" }, mealCount: 5, servingsPerMeal: 2,
      dietaryRestrictions: [], excludedIngredientIds: [], excludedAllergens: [], nutritionPriorities: [], objective: "balanced",
    },
  }, 200);
  assert.equal(plan.data.status, "feasible"); assert.equal(plan.data.pricingBasis, "illustrative");
  assert(plan.data.total.amountCents <= 8000); assert.equal(plan.data.total.currency, "USD");
  await post("/api/optimize", {}, 422);
  for (const country of ["CA", "US"]) {
    const catalogResponse = await get(`/api/v2/catalog?country=${country}`);
    assert.equal(catalogResponse.headers.get("X-ShopMate-Contract-Version"), "2");
    const catalog = (await catalogResponse.json()).data;
    assert(catalog.catalogVersion); assert(catalog.ingredients.length); assert(catalog.recipes.length);
    const discovery = await post("/api/v2/stores", { mode: "demo", location: { country, postalCode: country === "CA" ? "M5V 2T6" : "02108" } }, 200);
    const input = { mode: "demo", country, catalogVersion: catalog.catalogVersion, storeIds: discovery.data.stores.map(store => store.id) };
    const prices = await post("/api/v2/pricing", input, 200);
    assert(prices.data.stores.every(store => store.basis === "illustrative"));
    const result = await post("/api/v2/optimize", { ...input, preferences: { weeklyBudget: { amountCents: 8000, currency: country === "CA" ? "CAD" : "USD" }, mealCount: 2, servingsPerMeal: 2, dietaryRestrictions: [], excludedIngredientIds: [], excludedAllergens: [], nutritionPriorities: [], objective: "balanced" } }, 200);
    assert.equal(result.data.status, "feasible"); assert.equal(result.data.pricingBasis, "illustrative");
    assert.equal(result.data.catalogVersion, catalog.catalogVersion); assert(result.data.optimizerVersion);
    assert(result.data.total.amountCents <= 8000); assert(result.data.search.candidateRecipeIds.length);
    await post("/api/v2/pricing", { ...input, catalogVersion: "old-catalog" }, 422);
  }
  await get("/api/v2/catalog?country=CA&country=US", 422);
  await get("/api/v2/deals?country=US&province=ON", 422);
  await post("/api/v2/stores", { mode: "live", location: { country: "US", postalCode: "14201" } }, 503);
  console.log(`Production HTTP smoke checks passed (${checks} requests).`);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
}
