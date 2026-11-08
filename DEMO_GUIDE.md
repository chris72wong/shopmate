# ShopMate — two-minute demo

ShopMate turns personalized Gemini meals into one actionable grocery list. Its differentiator is deterministic ingredient consolidation plus single-meal swaps that immediately update the list. No fictional grocery facts are used in the main journey.

## Run

Use Node 24 and the existing npm lockfile. The final review server is on http://127.0.0.1:3111/plan. If it has stopped:

```powershell
npm ci
npm run build
npm start -- --hostname 127.0.0.1 --port 3111
```

For development use `npm run dev` and http://localhost:3000/plan. Stop this checkout's server before rebuilding.

Configure server-only `GEMINI_API_KEY` in `.env.local`. The configured key was live-tested with `gemini-3.5-flash-lite`. Optional `GOOGLE_MAPS_API_KEY` enables nearby grocers using Geocoding and Places API (New). `GOOGLE_GENAI_API_KEY` is also accepted for Gemini. Never use a `NEXT_PUBLIC_` name or commit credentials. No Share-A-Cart credential is configured.

## Recording walkthrough

1. **0:00–0:15:** Open `/plan`. Choose Canada; enter St. Catharines postal code `L2R 5L3`. Continue.
2. **0:15–0:35:** Move the household slider and return it to 2. Leave the budget at CAD $100 and choose 3 meals. Select Vegetarian if desired. Explain that the budget guides ideas; actual grocery prices are unavailable.
3. **0:35–0:55:** Create meals. These are live Gemini requests, so allow a few seconds. Show distinct meals and open one recipe's full-household ingredients and cooking instructions. Food art is explicitly an illustration.
4. **0:55–1:15:** Swap one meal. The other two stay in place. Open Grocery list: overlapping ingredients combine and quantities update. Different measurement/preparation states remain separate rather than being converted by guesswork.
5. **1:15–1:40:** Check off a pantry ingredient. Copy remaining, then download the `.txt`. Both omit checked groceries. Open Shop ingredient to show a genuine Walmart Canada search URL.
6. **1:40–2:00:** Optionally find nearby grocers: actual Google store/address/distance and Maps attribution. Close with the value: meals, one usable list, and a shopping handoff without manually adding up recipes.

For a US recording choose United States and Buffalo ZIP `14201`; the budget is USD and searches target Walmart US/Kroger. Test generation before recording. If the provider returns a temporary error, use the visible retry; no sample meals are silently substituted.

## Verified behavior and honest boundaries

- Live Gemini: Canadian CAD and US USD households, vegetarian generation and a distinct single-meal replacement passed through the built app. An opt-in direct integration test also passed.
- Browser: Canadian generation, recipes, swap preserving other meals, ingredient totals, check-offs, successful clipboard and real downloaded text. Mobile list had no horizontal overflow at the browser's effective 375 CSS-pixel width. Canadian Google discovery returned an actual St. Catharines grocer with official attribution.
- Retailer search routes: Walmart Canada, Walmart US and Kroger. These are searches, not matched product links or carts. See docs/SHARE_A_CART.md.
- `npm run verify`: lint, strict types, 706 passing tests (6 opt-in tests skipped), production build and 38 production HTTP smoke checks.
- Recipes are AI-generated suggestions. Common dietary conflicts are rejected, but brand ingredients/cross-contact and cooking correctness require user review. No nutrition guarantees, observed grocery prices, savings, inventory, delivery, package purchase totals or checkout carts are claimed.
- There is no Share-A-Cart integration: application authentication and regional retailer search/cart access remain unavailable/unverified. No real cart was created.
- Meal/checklist state is in browser memory and resets on refresh. Copy/download preserves a usable list. The legacy `/demo` is separately labeled fictional/illustrative and is not used by the main workflow.

## Re-run checks

```powershell
npm run verify
# With the production server running: four real Gemini calls plus currency validation
node scripts/live-meal-check.mjs http://127.0.0.1:3111
# Optional single real-model test; may incur normal provider charges
$env:SHOPMATE_RUN_GEMINI_LIVE='1'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/meal-live.test.ts
```

The default suite and HTTP smoke checks make no live Gemini calls. Provider failure, malformed/truncated output, dietary conflicts, stale/cancelled responses, currency mismatches and missing-key behavior have automated coverage. Browser observation included a temporary provider error followed by successful retry; generation availability depends on Google.
