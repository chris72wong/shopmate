# Backend pricing and automatic selection

Implementation checked November 7, 2026. This checkout had **no `.env.local` and none of the Google, Reef, Kroger or mapping environment variables configured**. The user confirmed no retailer credentials are available yet. No authenticated Google/retailer production requests or complete real baskets were verified in this task. Synthetic test prices are confined to tests.

## Diagnosis and fixes

The existing production pricing service selected **Reef only**, with Loblaws-family Canada pickup and Kroger-family US in-store adapters. It required `REEF_KEY`, `SHOPMATE_PRICING_STORES` and `SHOPMATE_PRICING_PRODUCTS`. The two mapping arrays intentionally defaulted to empty: no reviewed physical branches, product IDs, drained weights or preparation evidence had been supplied. Google IDs are location identities, not retailer location IDs or product prices. A retailer/banner match alone cannot populate those arrays truthfully.

`KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` previously powered only `kroger-probe.ts`; setting them could not make the production pricing service work. The new `kroger.ts` adapter connects official Public Products/Locations access to `/api/v2/pricing`, `/optimize` and `/plan`. Provider dispatch is explicit: a reviewed Reef binding still uses Reef; credentials never silently redirect a store to another provider.

Official Kroger can resolve a US branch by querying up to 20 retailer locations near the Google address ZIP, then requiring one exact banner/street/city/state/ZIP match. Corporate siblings stay separate. No nearest-branch guess, fuzzy address match or Google payload persistence is used. Ambiguity/format differences leave pricing unavailable; configure a reviewed binding if needed. An explicit binding is independently rechecked against the retailer location endpoint.

Product mappings remain necessary because price feeds do not establish canonical ingredient/preparation equivalence. Configure actual IDs, exact names/brands, net and usable quantities, preparation and evidence using the schemas in [PRICING.md](PRICING.md). Chicken breast cannot be replaced with whole/cooked/breaded chicken; oats must explicitly identify gluten-free rolled oats. Canned net weight is never assumed to be drained weight. Other matching remains conservative reviewed exact identity, not general-purpose fuzzy ingredient inference.

The former 12-row truncation is replaced by up to 64 deterministic reviewed lookups per branch under the shared 20-second start deadline. All 31 catalog ingredients can now be queried when mapped and within quota/time. Exact Kroger SKU lookup avoids search-result ambiguity; repeated queries are reused within a run. A later timeout/quota/SKU failure preserves earlier fresh verified offers and leaves unchecked ingredients missing. Invalid optional pricing configuration still does not discard discovered stores.

## Available integrations and access

| Source | Implemented scope | Required access / current limit |
| --- | --- | --- |
| Official Kroger (`kroger`) | US Kroger-family locations actually returned by the API; fixed-package regular in-store prices, stock, package labels and retrieval timestamps | `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, Public Products/Locations access, `product.compact`, reviewed product mappings; no credentials/live location tested here |
| Reef (`reef-loblaws`, `reef-kroger`) | Existing five Canadian Loblaws-family pickup banners and US Kroger-family in-store observations | `REEF_KEY`, reviewed branch/product mappings; no credentials/live location tested here |
| Bidou RSS | Existing ON/QC regional advertised deals | No key for RSS; regional ads are not branch baskets and never enter optimization |
| Instacart Developer Platform | Investigated documented shopping-list/recipe-link and nearby-retailer interfaces | API key/granted endpoint access; no documented physical-branch price feed established for this optimizer |
| Walmart OPD | No adapter | Linked official pages did not expose readable API/access details during this review; credentials, grants and schema remain unverified. Marketplace seller APIs are not substituted. |

The [Kroger-owned public collection](https://www.postman.com/kroger/the-kroger-co-s-public-workspace/documentation/ki6utqb/kroger-public-apis) documents location search/details, location-filtered product search/details and `ais` fulfillment. [Application registration](https://www.postman.com/kroger/the-kroger-co-s-public-workspace/collection/ki6utqb/kroger-public-apis) generates OAuth client credentials. This implementation does not claim blanket downstream display rights or nationwide SKU coverage. Confirm your account grants and applicable terms before launch.

[Instacart's API overview](https://docs.instacart.com/developer_platform_api/api/overview) requires an API key; its [FAQ](https://docs.instacart.com/developer_platform_api/faq) describes restricted endpoint grants and product-name matching rather than direct SKU selection. Its shopping-page capabilities are not evidence that ShopMate can retrieve comparable physical-branch baskets. [Walmart's referenced OPD entry](https://www.walmart.io/docs/opd/catalog-pricing-and-availability-realtime/grocery-introduction) could not be verified as an available public integration. Existing permitted adapters were retained; no undocumented endpoint or access bypass was added.

## Frontend integration changes

All changes are additive v2 fields/routes. V1 envelopes, fields, IDs and behaviors remain intact. No frontend components or UI utilities were edited.

1. `POST /api/v2/stores` now returns `selectedStoreIds` and `selection` alongside all existing fields. Initialize selection from those IDs. The automatic set is the three closest **returned distinct banners**, independent of prices. `stores` retains all returned eligible banner representatives for overrides. `selection` reports strategy, limit, straight-line basis, non-exhaustive coverage and the 20-candidate limit. Fewer than three is valid. Demo uses the existing fictional order and never invents distances.
2. New `POST /api/v2/plan` accepts `{ mode, location, radiusKm?, catalogVersion, preferences, storeIds? }`. It performs discovery, selection, pricing and planning in one call. Omit `storeIds` for automatic selection; an explicit override must reference eligible stores returned by that location search. It avoids a redundant Google Place Details round trip because stores were just authoritatively discovered. Existing separate pricing/optimization routes still re-resolve submitted IDs.
3. `/plan` returns `{ status, discovery, selectedStoreIds, optimization, pricingError }`. Status is `planned`, `pricing-unavailable`, `no-plan` or `no-stores`. A pricing-provider failure **after successful discovery** is a 200 domain result with sanitized `pricingError` and the selected stores preserved. Discovery/input errors retain their existing HTTP/envelope behavior. Existing `/pricing` and `/optimize` provider HTTP 503/429/502 semantics are unchanged. Keep selection on pricing failure; offer retry, eligible alternatives and explicit demo entry.
4. Accept `"kroger"` in the two provider-ID validators in `src/lib/planner-api.ts`. Current frontend validators know only Reef and will reject official Kroger quotes until the frontend owner updates them.
5. `/api/v2/optimize` now always emits `mixedStorePlan` (complete plan or null). The shared TypeScript field is optional for older clients. It has its own meals, requirements, nutrition estimates, purchase lines with actual `storeId`, store subtotals, total, remaining budget, basis, optimality and savings. Add parsing/presentation in the frontend. Existing top-level optimization status/totals still describe **single-store** planning; inspect `mixedStorePlan` independently, even when single-store status is `infeasible`. `/plan` reports `planned` if either strategy has a feasible complete plan.

## Mixed-store calculations and honesty

Revision `catalog-multiset-2` evaluates single-store and mixed-store plans over the same dietary-eligible catalog multisets, scaling servings and aggregating shared ingredients before buying packages. Each ingredient's exact covering purchase can use any selected store's compatible packages, including multiple stores for one ingredient. Product and branch identity remain attached to every returned line. Same-country currency and same price channel are mandatory; fresh verified and illustrative offers are never combined.

The mixed plan independently uses the existing cost/nutrition/balanced scoring, hard budget, exclusions and allergy/diet filtering. It can complete a basket using complementary partial stores even when no single store covers it. Incomplete single-store baskets retain no total. Mixed savings compare only the identical mixed plan's cheapest complete single-store basket; otherwise savings are null. A different single-store meal plan is not a savings baseline. Travel, taxes, fees and deposits are excluded.

Metric/US fixed packages preserve six-decimal canonical precision. When integer covering DP would require excessive states, exact package-count enumeration is used. If that search or the meal search is capped, results are conservatively `best-found`/`incomplete`, with `search.exhaustive: false`; no truncated search proves infeasibility or optimality.

Nutrition/allergen metadata is still sample ingredient metadata, not retailer label verification or cross-contact assurance. Human-reviewed mappings and actual package labels remain important. No live Canadian or US real basket is claimed without a credentialed, completely mapped run. Automated matching/setup for arbitrary SKUs and unsupported retailers remains unavailable.

## Verification

New tests exercise automatic selection/overrides in CA/US, exact official branch mapping, OAuth/token expiry, regular prices and sale metadata, exact SKU lookup, explicit stock/channel evidence, quota/auth errors, all-ingredient querying, partial quote retention, complete single/mixed baskets, package rounding, metric/US sizes, budget edges, exclusions and capped searches. Existing sample journeys and backend tests are included in `npm run verify`. Production HTTP smoke adds CA/US one-call sample planning and clears all Google/Reef/Kroger credentials in its child process.

Credentialed tests are opt-in and skipped without credentials. Configure locally (never paste secrets), then run `SHOPMATE_LIVE_SMOKE=1` with `tests/backend-live.test.ts`, `tests/pricing-live.test.ts` and `tests/pricing-official-live.test.ts`; the latter requires a reviewed official branch/SKU mapping. A successful one-SKU check still does not prove a complete basket. Run a full `/api/v2/plan` request with every required ingredient mapped before claiming real planning coverage.

`npm run verify` passed: lint, strict typecheck, **525 passed / 5 skipped tests in 25 files**, production webpack build, and **29 production HTTP smoke requests**, including CA/US automatic sample plans. The first sandboxed run reached a Windows `EPERM` while creating the new route's `.next` output; the subsequent full run with normal filesystem/loopback access passed. `git diff --check` passed. No dependency versions, frontend files or live response fixtures were changed.

The skipped tests are explicitly opt-in network checks. No actual Canadian or US location, authenticated retailer response or complete real basket was tested here. Browser presentation of the new API fields remains the frontend worktree's integration work; backend route tests and production HTTP smoke do not certify that new UI. The smoke server stopped on completion.
