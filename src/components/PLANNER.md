# ShopMate frontend

ShopMate now starts directly with country selection. Home and `/demo` share one interactive planner; pages remain Server Components and pass existing catalog metadata to the client. Backend routes, providers, contracts, catalog, configuration, dependencies, and lockfile are unchanged.

## Visual revision

The previous design repeated marketing copy, provenance explanations, and decorative card treatments. It also added an unnecessary welcome screen and illustrated sidebar. This revision removes those structures instead of adjusting their padding.

- One 480px app column at desktop sizes, with the same flow on mobile.
- Short headings and labels; no marketing hero, slogans, feature grid, sidebar, gradients, floating panels, badges, emoji illustrations, or food SVGs.
- Locally hosted DM Sans, quiet borders, restrained cream/forest/sage colours, and flat store, meal, and grocery rows.
- Real, locally stored photography. Source and license records are in `public/photos/README.md`; the app has a photo-credit page. DM Sans includes its OFL license in `src/app/fonts/`.
- Allergens, ingredient exclusions, review details, and package quantities expand only when requested. Necessary fictional-store, illustrative-price, and estimated-nutrition labels remain visible.

The exact [Mise Android listing](https://play.google.com/store/apps/details?id=com.gregorytaylor.shopping&hl=en_CA), package `com.gregorytaylor.shopping`, was revisited in the browser. Its publicly accessible preferences screenshot was inspected again, alongside the four screenshots inspected previously. No installed/private screens were accessed. The reference informed compact controls, short copy, food photography, and grouped checklists; ShopMate retains its own branding.

## Workflow and integrations

1. Country, postal/ZIP code, and radius.
2. Returned stores and addresses; select 1–3 stores.
3. Household, budget, diet, optional allergen/ingredient exclusions, and protein preference.
4. Meal count, objective, optional review, then submit.
5. Loading, errors, infeasible/incomplete results, or meals, store comparisons, shopping lists, and nutrition.

The integrated planner uses v2 store discovery, selected-store pricing preflight, and optimization. The server-rendered catalog includes its revision; the browser submits it with pricing and optimization. Strict v1 compatibility parsing remains for tests/legacy consumers, alongside v2 schemas and mode/country/currency/catalog/basket checks. Request cancellation and state invalidation remain intact. No browser location storage or query-string postal code was added. Back navigation retains preferences; location changes clear dependent stores/results. Failed live requests never become sample success.

Demo discovery, pricing and optimization now complete the five-step journey without credentials, using fictional stores and illustrative prices. Google discovery requires GOOGLE_MAPS_API_KEY. Verified live optimization requires REEF_KEY plus reviewed branch/product mappings; unsupported stores remain unavailable and never receive sample prices. Results use the actual offer package names/sizes and show quote channel, retrieval/expiry and source links. Nutrition remains estimated; store selection compares whole baskets rather than split purchases. See [integration verification](../../docs/INTEGRATION.md) and [pricing setup](../../docs/PRICING.md).

`public/google-maps-logo.svg` remains the unmodified official attribution asset for live store results. Public policies and other live-launch gates remain backend/integration dependencies in the shared deployment documentation.

## Verification — November 7, 2026

`npm run verify` passed after the final code changes: lint, strict TypeScript, 5 files / 93 tests, production build, and 13 production HTTP smoke requests. `git diff --check` passed.

Browser checks used the final production build plus earlier development checks:

- Inspected desktop at 1280 × 900 and mobile at 390 × 844; checked the 320px entry breakpoint. No horizontal overflow in inspected states.
- Tested Canadian empty/invalid postal codes, US country switching, leading-zero ZIP submission, keyboard submit, and honest live 501 handling.
- Tested explicit CA/US sample entry, multiple store selection, household and meal counters, budget validation, diets, allergen and canonical ingredient exclusions, protein preference, review, back navigation/state retention, and actual optimization 501 handling.
- Verified all five local photographs loaded on the credits page.
- Inspected meal photos/details, store comparison, grocery checks, copy confirmation, store switching, package details, and nutrition using an isolated synthetic response on a temporary loopback test proxy. The fixture used existing illustrative catalog data. It was not a response from the real optimizer, was never imported by the app, and the proxy was stopped after QA. Temporary test artifacts live only in git-ignored `artifacts/`.
- The print control is present; no physical print job was sent. No formal accessibility audit or real provider/optimizer success is claimed.

Screenshots were saved outside the repository in the chat's visualization directory: `shopmate-desktop.jpg`, `shopmate-mobile.jpg`, `shopmate-mobile-stores.jpg`, `shopmate-mobile-preferences.jpg`, and explicitly named synthetic-result captures. Temporary viewport overrides were reset. The production preview remains running at http://127.0.0.1:3001.
