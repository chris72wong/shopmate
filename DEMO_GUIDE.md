# ShopMate — two-minute connected demo

ShopMate connects a real nearby grocer to personalized meals and one actionable grocery list. It consolidates ingredients, recalculates after individual meal swaps, and carries the chosen shop into directions, supported retailer searches and exported lists.

## Run

The final review app runs at http://localhost:3000/plan. If stopped, use Node 24 and:

```powershell
npm ci
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

Stop this checkout's server before rebuilding. Use `npm run dev` for development. Server-only `.env.local` settings: `GEMINI_API_KEY` (or `GOOGLE_GENAI_API_KEY`) for meals; `GOOGLE_MAPS_API_KEY` for Geocoding/Places. Existing configured keys remain local and ignored by Git. No image key or runtime image API is needed.

## Recording walkthrough

1. **0:00–0:20 — Your location.** Choose Canada and enter St. Catharines `L2R 5L3`, or choose US and Buffalo `14201`. Find nearby grocers. Google performs the actual lookup; the default radius is 10 km.
2. **0:20–0:35 — Your grocer.** Choose a returned store, noting its real address and straight-line distance. A store labeled Online ingredient searches supports retailer-wide searching. Other stores support an in-person list and directions. Continue with this store. If needed, try 25 km; the explicit regional-links option remains separate from a local store.
3. **0:35–0:55 — Your table.** Move the household slider and return it to 2. Keep CAD/USD $100 and choose 3 meals. Select Vegetarian. Budget guides meal ideas, not a verified basket total. Create meals.
4. **0:55–1:15 — Meals.** Show the appetizing bundled food imagery, labeled AI-generated serving inspiration. Open one recipe and show full-household quantities and instructions. Swap one meal to demonstrate the list recalculating while other recipes remain.
5. **1:15–1:40 — Groceries.** Open Grocery list. Show combined ingredients, then check off a pantry ingredient. Copy or download remaining groceries; the export includes the selected store and directions. For a supported retailer, expand Shop ingredient to show that searches now target the chosen retailer.
6. **1:40–2:00 — Shopping handoff.** Show Get directions and Visit retailer website where available. Change shop without regenerating meals. Close with the value: location, meals, one consolidated list and a practical shopping handoff.

Prepare a plan before recording to avoid provider latency. Store results and meal names change; no branch or recipe is hardcoded. If discovery fails, show the error and use the explicitly labeled regional shopping option. If Gemini fails, use visible retry; no sample meals replace a failed request.

## Data and access honesty

- Google returns actual grocery stores, including independents in the main flow, with official Maps attribution. Country, radius, business type, operational status and candidate limits are enforced. This is a bounded search, not every store nearby. Store results stay in memory and clear on location edits.
- Gemini generates original structured recipe suggestions. Country, household, budget intention, diet and allergens affect the request. The selected store does not imply known inventory. Written ingredients and actual product labels are authoritative.
- Six original category images were generated once using the built-in imagegen tool and bundled locally. Viewing, generating or swapping meals makes zero image-generation API calls and uses no Gemini image quota. The images are serving inspiration, not exact recipe photographs. Prompts/provenance: docs/MEAL_IMAGES.md.
- Verified public ingredient-search routes: Walmart Canada, No Frills, Loblaws, Walmart US and Kroger. They are retailer-wide searches, not branch-bound stock checks or prefilled checkout carts. Retailers handle branch/address selection, product suitability and fulfillment.
- Unsupported online grocers retain an in-person list and exact-place directions. They never silently link to another retailer. Choosing regional shopping is an explicit alternative.
- There is no Instacart/Share-A-Cart API integration or verified delivery/cart creation. Separate approved access is still required. No grocery prices, savings, product matches, stock or delivery eligibility are invented.
- Meal/checklist state resets on refresh. Copy/download preserves a usable list. The separately labeled legacy `/demo` is not the primary product.

## Repeat checks

```powershell
npm run verify
# Optional: with the server running, four real Gemini requests plus currency validation
node scripts/live-meal-check.mjs http://127.0.0.1:3000
```

The default suite and HTTP smoke make no live Gemini requests. The full verification result and latest browser observations are in AGENT_HANDOFF.md. Avoid repeated live generations while on a free API tier; bundled imagery adds no image API usage.
