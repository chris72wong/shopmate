# ShopMate morning demo

## Launch

Use Node.js 24 and npm in this repository:

```powershell
git switch codex/demo-ready
npm ci
npm run dev
```

Open http://localhost:3000/demo?country=US. No API keys or environment variables are needed. If dependencies are already installed, skip `npm ci`. For production: stop the dev server, run `npm run build`, then `npm start`. The agent's review server uses http://127.0.0.1:3107/demo?country=US while this session remains running.

## Reliable 60–90-second walkthrough

1. **0–15 seconds:** Open the US demo. Say: “ShopMate turns meal choices into complete grocery purchases, with whole packages and a real budget constraint.” Click **View sample stores**, keep all three selected, then **Continue**.
2. **15–30 seconds:** Keep **2 people**, **USD 80**, and no dietary restrictions. Click **Let’s pick meals**. Keep **5 meals** and choose **Nourish more**. Click **Create plan**.
3. **30–45 seconds:** The sample result is **USD 37.48**, with **USD 42.52 left**. Open a meal to show scaled ingredients and method. The optimizer allows repeated recipes; this scenario chooses five chicken-and-broccoli pasta meals.
4. **45–60 seconds:** Click **Stores**. Complete identical-meal baskets are Cedar **USD 37.48**, Orchard **USD 43.66**, Clover **USD 49.48**. The displayed comparison is **USD 6.18** versus Orchard. Explain that these are illustrative comparisons, not actual discounts.
5. **60–75 seconds:** Click **Shopping list**, then **Package details**. Show whole-package purchases versus quantities used and leftovers. Check an item and **Copy list**. The list follows the selected store and its actual package total.
6. **75–90 seconds:** Click **Edit preferences**, change the exact budget to **20.00**, continue, and **Create plan**. The nutrition-priority plan now uses lentil soup at **USD 14.04**, leaving **USD 5.96**. The budget changes the computed meal choice, rather than just a sentence in a response.

Use the remaining 30 seconds of a two-minute video to explain ingredient aggregation, integer-cent arithmetic and hard dietary constraints. No LLM provides prices, calculations or optimization.

## Optional second scenario

CA demo: 2 people, CAD 40, Vegan, exclude peanuts, 5 meals, **A bit of everything**. Expected single-store total **CAD 18.54**, split-store total **CAD 18.50**. The split list assigns carrots/garlic to Orchard and other items to Clover. Check carrots in All assigned stores, filter to Orchard, and observe **1/2 done**. Travel costs are excluded; a four-cent difference does not imply another trip is worthwhile.

Set a budget of **0.01** to demonstrate a clear **No matching plan** state. Invalid or empty exact budgets keep the user on Preferences. Restore a valid budget before recording the main scenario.

## What has been verified

- `npm run verify`: lint, strict types, **629 tests passed**, **5 opt-in tests skipped**, production build, **35 actual HTTP checks**.
- Actual production browser journeys for CAD and USD; vegan/peanut controls; tight-budget failure; purchase-strategy and store views; shopping-list checks across filters; copying; package usage details; narrow responsive layout with no horizontal overflow in the inspected list.
- Production HTTP confirms the USD 80 → USD 20 nutrition-priority scenario above, with exhaustive catalog search. No warnings/errors appeared in inspected browser console logs.
- Read-only optimizer audit additionally compared package costs against 500 deterministic brute-force cases.

## Honest limitations and setup

All demo stores are fictional and all demo prices are **illustrative**, independent CAD/USD fixtures. Nutrition/allergen metadata is estimated; users must check real package labels. Prices exclude taxes, fees, deposits, travel and stock changes. A plan covers the requested meal slots and servings, not a complete daily diet.

The catalog has 14 recipes and permits repeats. Balanced/cost priorities can favor batch cooking; no minimum variety is promised. Large searches can be capped, and the UI labels best-found/incomplete results accordingly. Shopping checks are held in the current results view; refreshing/replanning or switching purchase strategies resets them. There is no account, database, checkout or public deployment.

Live Google discovery uses `GOOGLE_MAPS_API_KEY`; verified retailer pricing requires the provider credentials and reviewed mappings in docs/PRICING.md (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `REEF_KEY`, `SHOPMATE_PRICING_STORES`, `SHOPMATE_PRICING_PRODUCTS` as applicable). Full credentialed real-price planning was not verified in this delivery. Missing services stay explicit and never silently become demo results. Do not configure live services for the recording; use the explicit demo.

Installation reported eight moderate dependency advisories; a fresh production-only audit request failed at the registry endpoint. No dependency versions were changed.

## Review and integrate

The deliverable is on `codex/demo-ready`; main was preserved. Inspect `git diff main...codex/demo-ready` and `git log main..codex/demo-ready`. After review, integrate with your normal merge workflow (for example, from a clean main checkout: `git merge --no-ff codex/demo-ready`). Nothing was automatically merged or deployed. Use `git rev-parse codex/demo-ready` for the final commit.

The branch is local: automatic approval review rejected the GitHub push because it considers the existing origin an unverified destination. The exact failure and resume command are in AGENT_HANDOFF.md. No source was pushed and no remote final-commit confirmation is claimed.
