# ShopMate connected-product handoff

## Delivery

Branch: `codex/meal-to-groceries`.
Verified implementation: `4486a9ee76f411cfc78f72913e28501256deb622` — Connect nearby grocers to meal shopping and bundle food imagery.
A documentation-only delivery commit follows; use `git log -1 --oneline` for the final tip. Existing origin is `https://github.com/chris72wong/shopmate.git`. Main remains unchanged. Earlier Gemini rescue implementation is preserved in the branch history.

## Ready to demo

The verified production app is running at **http://localhost:3000/plan**, exec session `17444`. The browser has a real US vegetarian plan associated with an actual Buffalo Tops store. The plan has three meals, bundled photorealistic images, a consolidated 15-ingredient list and a pantry check-off. Refresh resets in-memory plan/checklist/store state.

If the server ends with the host session, restart:

```powershell
npm start -- --hostname 127.0.0.1 --port 3000
```

Use `DEMO_GUIDE.md` for the updated four-step, two-minute walkthrough. Stop this checkout's server before rebuilding. Older ShopMate production servers on ports 3107/3111 were stopped; only the current port3000 server is needed.

## Completed behavior

- Main journey: location → real nearby grocer selection → household/preferences → meals and grocery list. Google discovery is part of the flow, rather than a disconnected optional result widget.
- Selected grocer appears in results, Maps directions, known retailer websites, supported ingredient searches and copy/download. Changing shops preserves existing meals and check-offs without another Gemini request. Location edits clear dependent store/meal state; stale responses are ignored.
- Genuine retailer-wide ingredient searches for Walmart Canada, No Frills, Loblaws, Walmart US and Kroger. Unsupported stores receive an in-person list/directions; they never silently point to another retailer. Explicit regional shopping is a separate alternative.
- Six original photorealistic, plant-based category images bundled in `public/meal-images/`, with deterministic recipe-category matching and visible AI-generated serving-inspiration labels. Created once using the built-in imagegen tool. No runtime image endpoint, external photo requests, Gemini image calls, billing changes or dependencies. Prompts and provenance: `docs/MEAL_IMAGES.md`.
- Additive `StoreDiscoveryRequest.discoveryScope` accepts `all-grocers` or `major-chains`. Primary UI requests all-grocers, including independent stores with provider grocery/supermarket types. Country/radius/operational/business-type checks, attribution, deadlines and 20-candidate cap remain. Unknown stores keep null chain IDs and unavailable pricing. Omitted scope preserves legacy major-chain discovery and optimizer resolution.
- Existing real Gemini 3.5 Flash-Lite generation, structured quantities, dietary safeguards, full regeneration and single swaps remain. Household/budget controls and reduced-motion behavior remain.

## Verification actually run

November 8, 2026:

- Final `npm run verify` passed: lint, strict typecheck, **751 tests passed / 6 opt-in tests skipped** (39 files), production build, **46 production HTTP checks**. HTTP checks include all six bundled WebPs, Next.js image optimization and discovery-scope validation.
- New scope tests cover CA/US independent grocers, excluded/closed/cross-border businesses, attribution, bounded requests, unknown scope rejection, unchanged omitted-scope behavior and unchanged optimizer store resolution.
- New UI/helper/image tests cover store selection, supported country/chain search links, honest unsupported-store behavior, regional choice, country/location clearing, stale/cancelled responses, preserved meals on shop changes, export context, local assets and category matching.
- Live Canadian browser: St. Catharines `L2R 5L3`, selected actual Farm Boy, 2 people, CAD100, three real vegetarian Gemini meals. Chosen store/address/directions carried into results and clipboard text; food photos loaded. Final all-grocer HTTP check returned **18 actual Canadian stores**, all Google-source/CA with unavailable prices.
- Final live US browser: Buffalo `14201`, actual nearby grocers returned; selected Tops Friendly Markets, 2 people, USD100, three real vegetarian Gemini meals. Switched to another returned grocer without regenerating; meal names and check state persisted. Copy/download included that newly selected grocer, address and Maps directions. Checked broccoli was omitted. Downloaded text was read and inspected.
- Explicit regional shopping then exposed real Walmart US/Kroger ingredient-search URLs; original meals remained. Restored the actual Tops selection for the final demo.
- Mobile results/list visually inspected at effective **375 CSS pixels**, scrollWidth also375. Viewport override reset. Final browser warning/error log was empty. All three visible meal images decoded successfully and used local Next.js image URLs.
- Screenshot: ignored `artifacts/connected-meal-demo.jpg`. Download: `C:\Users\myste\Downloads\shopmate-groceries-us.txt`, a verification artifact, not committed.
- `git diff --check` passed. No credentials, build outputs, screenshots or downloaded lists were staged. Main and dependency/lockfiles were preserved.

## Honest limits

This is a working meal-to-shopping-list assistant, not checkout automation. No Instacart or Share-A-Cart API key/access is configured. No real cart, product/SKU matching, branch inventory, grocery price, savings, delivery eligibility or delivery slot is claimed. Retailer sites handle branch/address selection and fulfillment. The bounded nearest20 Google search can return only stores without a supported online search; in-person directions/list and explicit regional searches remain useful.

Images represent category-level serving inspiration, not each exact generated recipe or allergy guarantees. Written ingredients and real product labels govern dietary suitability. Quantities with incompatible units/preparations remain separate; no density/count conversion is guessed. No persistent accounts/database/storage; copy/download preserves a usable list.

Server-only settings remain local: `GEMINI_API_KEY` (or `GOOGLE_GENAI_API_KEY`) and `GOOGLE_MAPS_API_KEY`. Meal requests still consume normal Gemini text quota; image display/selection consumes zero image-generation calls. Public launch privacy/terms, Google restrictions and quota controls remain documented in docs/DEPLOYMENT.md. No deployment or main merge was performed.
