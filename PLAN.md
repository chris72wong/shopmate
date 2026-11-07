# ShopMate foundation and MVP plan

## Purpose and milestone

ShopMate helps people plan meals they enjoy while managing grocery spending and dietary preferences. **Eat better. Spend smarter.** The UB Hacking 2026 MVP combines real nearby grocery discovery with explicitly illustrative grocery prices and a deterministic, package-aware meal planner.

The current milestone establishes a working foundation so three developers can implement independently. It deliberately stops before the complete user journey.

### Included now

- Next.js App Router with TypeScript, React, Tailwind v4, route handlers, Zod, ESLint, and Vitest.
- A minimal country-first entry flow, validated postal/ZIP input, and an explicitly labeled demo preview with an optional recipe library.
- Explicit CA/US fictional demo stores and an illustrative pricing provider; no credentials needed.
- Shared interfaces and validated requests for location, discovery, ingredients, recipes, products, pricing, preferences, and optimization results.
- A curated catalog of 14 recipes, 31 canonical ingredients/packages, six named chain pricing profiles, and six fictional demo pricing profiles.
- Working demo discovery, capability reporting, typed API scaffolds, regression tests, production HTTP smoke checks, and CI.
- Architecture, API/data assumptions, ownership boundaries, worktree commands, and deployment handoff.

### Deferred to the parallel implementation

- Live store selection, preferences, and results screens. The country/postal-code entry UI already exists and currently leads only to explicit demo data.
- Google geocoding, Places API (New), chain matching, and live attribution UI.
- Recipe combination search, ingredient consolidation, package counts, basket comparisons, and recommendations.
- User-facing complete/infeasible/incomplete result states and real end-to-end journey tests.

### Out of scope for the MVP

Authentication, accounts, payment processing, databases, live retailer price feeds, scraping, nutrition guarantees, multi-store split baskets, delivery/tax estimates, travel routing, and LLM-generated meals/prices. Publishing/deployment is a later user decision.

## User flow

1. **Location:** explicitly choose Canada or the US, enter a postal/ZIP code, normalize and validate it. Set CAD/USD from country. Format validation does not prove that a postal code exists; live geocoding does.
2. **Stores:** choose live discovery or an explicitly labeled demo. Search server-side within a configurable 1–50 km radius (5 km default). Show names, addresses, straight-line distances, pricing availability, and required attribution. Select one to three stores. Demo stores have no coordinates or distances and ignore location/radius.
3. **Preferences:** enter budget, number of meals (1–14), servings per meal (1–8), dietary restrictions, excluded ingredient IDs/allergens, high-protein priority, and cost/nutrition/balanced objective. Weekly budget covers the planned meal basket, not every food eaten in a week.
4. **Optimization:** validate stores again on the server, filter recipes against hard constraints, evaluate candidate plans, consolidate ingredients, round to purchasable packages, and compare the identical basket at each selected store.
5. **Results:** show the cheapest complete feasible store basket for the chosen plan, comparisons, meal servings, estimated total nutrition, consolidated shopping list, leftovers, remaining budget, and defensible reuse/savings explanations. Explain no-feasible-plan or incomplete-search states without inventing results.

## Architecture

```text
Browser UI (Agent A)
  -> POST /api/stores (Agent B)
       -> StoreDiscoveryProvider
            -> explicit demo implementation (exists)
            -> Google Geocoding + Places New (pending)
  -> POST /api/optimize (Agent C, integration by main)
       -> StoreDiscoveryProvider.resolveStores (server-authoritative metadata)
       -> OptimizationEngine (pending)
            -> curated recipes + canonical ingredients
            -> GroceryPricingProvider
                 -> illustrative local offers (exists)
                 -> real pricing feed (future, outside MVP)
  <- ApiResponse<T> using shared domain/request/result types
```

Keep the UI, discovery, and optimization independent. The frontend imports `src/contracts/` and consumes JSON endpoints; it does not import provider implementations. Next server pages may read the local catalog for the foundation preview. The API validates requests once at the boundary, then performs business validation using server-owned metadata.

`src/contracts/domain.ts` defines entities and discriminated results. `api.ts` defines requests, response envelopes, and contract version. `schemas.ts` defines executable validation/normalization. Types are shared; the schemas validate untrusted input. Full field semantics and current/future endpoint behavior are in `docs/API.md`.

### Server boundaries

- `StoreDiscoveryProvider.discover(request)` returns normalized location, origin, stores, attribution, and notices. `resolveStores(ids, country)` re-resolves selected IDs in the same mode/country before optimization; a stateless Google implementation can use Place Details (New) for IDs from discovery. No database/session cache is required.
- `GroceryPricingProvider.getOffers(store, productIds)` returns available illustrative offers or unavailable status. An available catalog can still omit requested products; the basket calculator must check every required ingredient.
- `OptimizationEngine.optimize(request, stores, pricing)` is the deterministic calculation boundary. Route handlers only validate, resolve providers, invoke the engine, and serialize.
- Main owns any composition/resolver wiring across B and C. Agent C can complete demo optimization using the existing resolver without importing Agent B's unfinished Google implementation.

### Store identity and pricing

Demo IDs are `demo-ca-cedar` (and clover/orchard), with analogous US IDs. Google IDs will be `google:<placeId>`. Demo and Google are distinct store types; demo coordinates, maps URI, place ID, and distance are always null.

Chain matching is country-scoped and conservative. Initial chain IDs: `ca-loblaws`, `ca-no-frills`, `ca-walmart`, `us-aldi`, `us-kroger`, `us-walmart`. Unknown stores remain discoverable, with unavailable pricing. Six fictional demo profiles are separate from these chain identities. All twelve profiles use illustrative data. Country prices are independent authored samples, not exchange-rate conversions.

Clients send only selected IDs to optimization. Reject unknown IDs and wrong-country stores server-side. Never accept price, chain, dietary, or nutrition assertions supplied by clients as trusted data. Review cost/abuse controls before enabling public Google-backed routes.

### Google integration and attribution

Agent B implements server-side requests with a country-restricted geocoder, timeouts, appropriate field masks, result limits, and provider errors. Suggested Places fields: ID, display name, formatted address, coordinates, address country components, Maps URI, and attribution. Avoid fetching photos/reviews in the MVP.

Return empty `stores` for a valid search with no stores; do not invent results. Return structured errors for unconfigured provider, quota, upstream failure, or invalid/nonexistent location. Never silently switch mode.

Live results need the official Google Maps attribution treatment, any third-party attributions, and applicable public Terms/Privacy pages. Follow current retention policies; do not introduce persistent Google-content caching. Attribution metadata alone is not sufficient to render a compliant UI. These requirements are a live-launch gate, not a claim that the foundation already implements Google.

References: [Geocoding requests](https://developers.google.com/maps/documentation/geocoding/requests-geocoding), [Nearby Search New](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies).

## Data and calculations

See `src/data/README.md` for all assumptions. IDs are stable and units are canonical: grams, milliliters, or count. Recipe quantities cover the full yield. Nutrition is estimated per serving from the same structured ingredients. Packages describe usable contents, including drained canned beans and edible produce portions.

All ingredients except water have package prices. Pantry staples are not free by default. No tax, delivery, coupons, promotions, or travel costs are included. Do not silently substitute wheat pasta/tortillas/soy sauce in a gluten-free plan. Certified gluten-free oats are a specific fixture assumption, not a statement about all oats.

### Agent C implementation sequence

1. Validate IDs/country/currency and filter recipes. Every selected dietary tag must be supported; any excluded ingredient/allergen disqualifies the recipe. Vegan already implies vegetarian in the dataset.
2. Scale each recipe's amounts by `servingsPerMeal / recipe.servings`. Aggregate by ingredient ID and unit across meal slots before rounding packages.
3. For one package option, buy `ceil(totalRequired / usablePackageContent)`. Avoid floating-point boundary errors with normalized quantities or an explicit tolerance. For future multiple package sizes, choose the cheapest combination that covers the requirement, rather than selecting only by unit price.
4. For each store, require complete ingredient coverage and matching currency. Add integer package purchase costs. Missing prices create an unavailable basket, never a falsely cheap partial total.
5. Evaluate plans under the hard budget using the cheapest complete store basket for each plan. Recommend the cheapest complete selected-store basket for the chosen plan, including when the meal objective favors nutrition.
6. Rank by objective using documented, deterministic scores. Cost objective minimizes full purchase cents. Nutrition emphasizes protein and fiber; high-protein priority adds a protein weight. Balanced combines cost, nutrition, variety, and reuse. Specify normalization/weights in implementation docs before treating scores as comparable.
7. Use a bounded deterministic multiset search or branch-and-bound; start with at most two occurrences per recipe and stable ID ordering. Do not use wall-clock time or randomness as the primary cutoff. Define an evaluation cap and expose search completeness.
8. Stable tie-breaking: score, complete basket cost, recipe-ID multiset, then store ID. Slot ordering must also be stable. Return feasible `best-found` if a capped search finds a plan; return `incomplete` if it stops without one. Only exhausted searches may claim `infeasible` or `proven` optimality within the documented candidate space.
9. Calculate reuse savings against independently buying packages for each meal at the recommended store. Calculate store-comparison savings only against another complete selected-store basket for the identical plan. Never compare hypothetical prorated ingredient costs to package totals as a savings claim.

The foundation contains interfaces and fixtures for these steps, not the optimization implementation.

## Parallel workstreams and completion criteria

### Agent A — frontend

Own UI routes/components/styles and browser-side state. Implement the five-step journey using shared validated inputs and `ApiResponse<T>`. Build with mock responses only when explicitly labeled; keep real network errors visible. Handle loading, empty discovery, unavailable pricing, max-three selection, constraints, and all optimization result variants. Keep current branding, accessible controls, and desktop/mobile usability. Completion requires browser checks and integration against real local routes.

### Agent B — store discovery

Own discovery providers, `/api/stores`, chain matching, and discovery-specific tests. Preserve shared schema behavior. Implement Google discover/resolve, country verification, straight-line distances, attribution metadata, unknown-chain handling, and sanitized provider failures. Test with authored synthetic fixtures, not copied live Google payloads. A missing key must yield `503 provider-not-configured` after implementation. No real-key tests are required for CI.

### Agent C — optimization

Own the engine, pricing/basket logic, `/api/optimize`, and calculation tests. Implement demo optimization first against the existing demo resolver and structured catalog. Cover aggregation before package rounding, leftovers, multiple servings/repeated meals, budget boundaries, currency consistency, excluded allergens/ingredients, unsupported stores, missing offers, deterministic ties, infeasible inputs, and incomplete searches. Additive catalog changes require reference/label checks.

### Main — integration

Own shared contracts/root configs/dependencies and cross-module wiring. Merge one workstream at a time, verify contracts, coordinate changes to shared files, then connect Google store resolution to optimization and finish attribution/policy UI. Run full verification and browser-based journey checks. Prepare Vercel without adding accounts, payment systems, a database, or other scope.

## Phases and gates

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0: foundation (current) | Shared code/data/docs, shell, explicit demo discovery | Lint/types/tests/build/production HTTP smoke pass; main commit exists |
| 1: parallel implementation | A frontend, B discovery, C optimizer | Owned feature tests and contract-compatible commits |
| 2: integration | Complete demo journey, then Google-backed discovery | Cross-store same-basket calculations; responsive/accessibility checks; truthful labels |
| 3: release preparation | Vercel settings, server key, limits/attribution/policy pages | Full journey, no-key/error behavior, production build, secrets review |

## Verification strategy

Foundation tests exercise contract normalization/limits, catalog references/units/diet/allergen/nutrition consistency, pricing profiles, fictional-store provenance, provider behavior, and actual route responses. Production smoke checks build output over HTTP: home/CSS, CA/US demo, health, 404, demo discovery, validation errors, and intentional 501 endpoints. This is transport coverage, not a completed user-journey E2E test.

Future engine tests use exact package/budget edge cases. Discovery tests mock network calls and cover upstream failures without credentials. Frontend/browser tests cover the actual integrated journey after it exists. Run checks appropriate to changed behavior; do not claim a completed feature from a scaffold test.

## Operational constraints

Node 24 LTS, npm lockfile, separate installations/build state per worktree. `GOOGLE_MAPS_API_KEY` is optional for the foundation and required only for live discovery after Agent B implements it. No secret reaches React client bundles. Vercel-compatible Node route handlers and ordinary Next.js build/start scripts require no custom server.

See `docs/WORKTREES.md` for creation/integration commands and `docs/DEPLOYMENT.md` for release setup. No worktrees, subagents, remote repositories, or deployments are created by the foundation task.
