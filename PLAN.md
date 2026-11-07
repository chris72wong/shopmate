# ShopMate recovery plan

Reviewed November 7, 2026. This is a documentation-only review; no application rewrite, provider integration, worktree, or delegation is authorized by it. [The shared API contract](docs/API.md) distinguishes the existing v1 interface from the proposed verified-pricing extension.

## What exists

The repository is a sound **foundation preview**, not a working grocery planner. Keep Next.js App Router, strict TypeScript, Tailwind, Zod, the cream/forest/sage/apricot theme, the catalog, and the provider boundaries.

| Feature | Observed behavior and evidence | Status |
| --- | --- | --- |
| Canada/US entry | `src/components/location-flow.tsx` chooses country/currency, validates postal/ZIP syntax, and preserves leading-zero ZIPs. `tests/contracts.test.ts` covers schema behavior. | Works for format validation; no geographic lookup |
| Search submission | Navigates to `/demo?country=…`; the postal code is not sent to `/api/stores` or retained in the URL. `/demo` supplies its own fixture postal code. | Navigation works; nearby search does not |
| Store discovery | `POST /api/stores` returns three fictional stores per country in explicit demo mode. Names/addresses come from `src/data/demo-stores.ts`; coordinates and distances are null. | Working fixture endpoint, not actual stores |
| Live discovery | `src/app/api/stores/route.ts` returns `501 not-implemented`, even if a Google key is present. No Google request implementation or chain matcher exists. | Stub |
| Store selection and preferences | Demo store cards are read-only. No multi-select, budget/diet form, shared journey state, or results screen exists. | Missing |
| Prices | `src/server/pricing/illustrative.ts` filters authored sample offers. The UI shows one oats package per fictional store. All 372 offers, including real-chain-named profiles, are illustrative. | Fixture pricing works; no retailer integration |
| Meals and nutrition | 14 recipes, 31 ingredients/packages, derived dietary/allergen tags and estimated nutrition; integrity tests check internal consistency. Cards show summaries, not meal selection. | Sample catalog works; real-world accuracy unverified |
| Optimization | `src/server/optimization/engine.ts` is only an interface. Valid `/api/optimize` requests return `501`. | No search, baskets, package rounding, reuse, waste ranking, or recommendations |
| API safeguards | Strict request schemas, integer cents, country/currency checks, explicit mode, error envelopes, no-store headers. | Works at schema/transport level |
| Business validation | Demo ID resolver rejects unknown IDs, but optimization never calls it. A correctly prefixed nonexistent store or unknown well-formed ingredient ID can reach the 501 stub. | Required before engine execution |

The UI fragmentation is functional: location input ends at a disconnected preview, and the remaining journey has no controls or state. Responsive CSS, focus styles, reduced-motion handling, original SVG illustrations, and truthful sample labels already exist. A new visual shell alone would not repair the missing flow.

## Intended journey and truth rules

1. **Location:** choose CA/US, derive CAD/USD, validate syntax, then geocode within the selected country. Format validity does not establish postal-code existence. Changing country or location clears dependent stores/results.
2. **Stores:** show provider-returned grocery names, actual addresses, Maps links, attribution, and labeled straight-line distances. Select 1–3 stores. Unsupported pricing stays visible; a chain-name match does not establish branch prices. Empty results and provider errors remain visible.
3. **Prices and preferences:** establish verified branch/SKU/package coverage where an authorized adapter exists; collect budget, meals, servings, diets, exclusions, and objective. A separate, explicit sample demo can use the existing fictional fixtures without requiring a location search.
4. **Plan:** server resolves IDs, filters hard constraints, consolidates ingredient quantities, purchases whole packages, checks complete same-currency baskets against budget, then ranks feasible plans deterministically.
5. **Results:** meals, estimated nutrition, one comparable complete basket per selected store, cheapest complete store for that plan, shopping list, remaining budget, and package leftovers/reuse. Multi-store **selection/comparison** is in scope; splitting a basket across stores is later work.

Never mix verified and illustrative offers or quietly replace live failures with fixtures. Never show an incomplete subtotal as a comparable total. Nutrition/high-protein/reuse/waste ranking are soft objectives; budget, dietary restrictions, exclusions, and full ingredient coverage are hard constraints. All required ingredients except water cost money. Leftovers estimate unused package contents, not measured food waste or shelf-life outcomes.

## External services and access gates

These are candidates, not installed or tested integrations. Credential values were not inspected and no paid provider calls were made.

| Need | Service/access | Recovery decision |
| --- | --- | --- |
| Actual stores/addresses in CA and US | Google Cloud project with billing, Geocoding API and Places API (New), server-only `GOOGLE_MAPS_API_KEY` (the only key declared in `.env.example`). | Implement country-restricted geocoding, Nearby Search, and Place Details for ID resolution. Google place data is not a grocery SKU price feed. See [Geocoding](https://developers.google.com/maps/documentation/geocoding/requests-geocoding), [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search), and [billing/field masks](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing). |
| A narrow real-price US slice | Evaluate Kroger Products/Locations APIs; application registration generates OAuth client credentials. Proposed server settings: `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`; neither is wired. | First prove granted product/location access, branch mapping, returned prices, usable package sizes, coverage, and permission for this comparison use. No integration or approved access is established. See [Kroger's official collection](https://www.postman.com/kroger/the-kroger-co-s-public-workspace/collection/ki6utqb/kroger-public-apis) and [reference](https://developer.kroger.com/reference/). |
| Other retailers, especially Canada | An authorized feed with branch/SKU prices, package content, timestamps, availability, and display/comparison rights; credentials depend on the provider. | No verified Canadian or cross-retailer adapter exists here. Fixture names do not establish Loblaws/No Frills/Walmart/ALDI access. Do not promise nationwide price coverage. |
| Optional shopping handoff | Instacart Developer Platform API key with granted endpoint permissions. | Public shopping-list/recipe links do not establish an optimizer price feed. Its nearby-retailer response identifies organizations, not physical branches/addresses. Verify additional catalog rights before considering it a pricing source. See [API overview](https://docs.instacart.com/developer_platform_api/api/overview), [nearby retailers](https://docs.instacart.com/developer_platform_api/api/retailers/get_nearby_retailers), and [access limits](https://docs.instacart.com/developer_platform_api/faq). |
| Nutrition/planning | Existing structured catalog; no API key or LLM needed. | Keep estimates visible. Traceable composition/branded-label data is a later accuracy upgrade; current tests certify consistency, not real-world nutrient/allergen accuracy. |

For Google, bound radius/results, use explicit field masks/deadlines, sanitize errors, and add quotas/request controls. Before exposing live results, provide official Google Maps logo treatment, applicable third-party attribution, public Terms/Privacy pages, and retention handling. This project keeps the stricter logo requirement in `AGENTS.md`. See [Google's policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [deployment gates](docs/DEPLOYMENT.md). Do not persist search payloads or log postal codes/precise locations. The list-only UI needs no browser Maps SDK/key.

## Hackathon delivery order

Assume roughly 24–36 engineering hours; provider approval/coverage is an external dependency, not a deadline guarantee. Work sequentially in the current checkout unless the user later authorizes parallel work.

| Order | Deliverable | Acceptance gate |
| --- | --- | --- |
| 1. Establish access early | Time-box a Google credential check and one pricing adapter/branch/product spike. Record countries/branches, price channel, package mappings, access rights, and gaps. | Authenticated requests succeed; no sample values or undocumented coverage claims. If unavailable, retain the limitation and continue independent planner work. |
| 2. Complete the local planner | Demo ID/business validation, dietary filtering, serving scaling, aggregation, complete per-store baskets, whole-package buying, budgets, deterministic search, reuse and leftovers. | Exact package/budget/exclusion/missing-price tests; feasible, infeasible, and capped-search results tested. This can form an end-to-end **explicit sample** experience without credentials. |
| 3. Connect one coherent UI | Five steps with retained selections, back navigation, labels, loading/errors/empty states, and all result variants. Reuse the theme/components; consumer copy replaces scaffold/agent language. | Browser tests exercise CA/US from entry through preferences to results against actual local routes; keyboard/mobile checks pass. |
| 4. Enable actual discovery | Google adapter, authoritative ID resolution, country checks, attribution/error handling; wire location submission to `/api/stores`. | Synthetic upstream tests plus separate credentialed CA/US smoke runs. Unconfigured/quota/timeout/empty searches never become fictional success. Stores without verified prices show no real-price plan. |
| 5. Optional verified-price slice | After step 1 passes, implement proposed v2 for one provider and a curated, completely mapped recipe subset. Fetch once per optimization request and use that fixed offer set. | Provenance/freshness/missing-coverage tests plus a credentialed end-to-end run. Label exact branch/channel coverage. Real comparisons need two complete selected-store baskets; one complete store supports only a single-store plan. |

The credible event deliverable is a tested sample planner and, with Google access, actual nearby discovery. A real-price plan is conditional on verified access and complete recipe coverage; a CA/US-wide live comparison service is not a defensible event promise. Defer accounts, databases, scraping, checkout, split-store allocation, routing, taxes/fees, variable-weight goods, loyalty-dependent pricing, and verified nutrition guarantees. No deployment is performed by this review.

## Calculation and verification gates

- Reject unknown/wrong-country/mode store IDs and unknown exclusion IDs server-side. Never trust browser prices, package sizes, nutrition, or chain mappings.
- Scale full recipe yields, aggregate by ingredient/unit **before** rounding, and preserve dry/drained/edible semantics. Never convert ml to g implicitly. With multiple package sizes, choose a covering combination by full purchase cost; exclude ambiguous/variable-weight mappings initially.
- Compare identical requirements at each store. Every ingredient needs coverage, including pantry oil. Missing offers make that store basket unavailable with no total; other complete baskets can still compete.
- Document/version objective weights and stable tie-breaking. Balanced ranking includes protein/fiber estimates, variety, ingredient reuse, and normalized leftover-package fractions; do not add grams, ml, and counts into a single waste weight. High protein has no hard minimum in v1.
- Use a deterministic evaluation cap. Truncation permits `best-found`, or `incomplete` if no feasible plan was found. Only exhaustion of the documented candidate space permits `infeasible` or `proven`. No hidden recipe-repeat limits followed by claims of global impossibility.
- Reuse savings compare separate-meal packages with consolidated packages at the same store. Store savings compare complete baskets for the same plan. Never invent checkout savings or market-wide optimality.

Review run: **`npm run verify` passed** on November 7, 2026 (Node 24.15.0, npm 11.12.1): lint, typecheck, 4 test files / 63 tests, production build, and 13 HTTP smoke requests. The suite covers contracts, fixture integrity/providers, route validation, and deliberate 501 behavior. It contains no optimizer implementation tests, live external-service tests, or automated browser journey. No fresh browser/accessibility inspection was performed; earlier manual checks remain historical in [VERIFICATION.md](docs/VERIFICATION.md).

Before marking later work complete, run repository checks plus the feature-specific gates above. Capability flags require implementation and passing integration tests; credentials, interface definitions, fixtures, and a green scaffold suite are insufficient.
