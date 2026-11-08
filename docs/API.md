# Shared API contract — version 1

> Integration update — November 7, 2026: the committed frontend and backend are merged on main. The browser now uses v2 discovery/pricing/optimization; the complete sample journey works. Google/Reef credentials and reviewed retailer mappings are absent, so credentialed end-to-end coverage is unverified. Earlier foundation/recovery observations below are historical. See [INTEGRATION.md](INTEGRATION.md) for final verification and [PRICING.md](PRICING.md) for setup.

Updated November 7, 2026. Authoritative v1 definitions remain in `src/contracts/`. The additive [v2 verified-pricing contract](#v2-verified-pricing-contract) is implemented in `src/contracts/pricing-v2.ts` and `/api/v2/*`. Source access, actual live trials, configuration and remaining credential gates are recorded in [PRICING.md](PRICING.md). V1 field shapes remain unchanged; illustrative optimization is restricted to explicit demo mode.

These contracts let frontend and backend work against one interface. Coordinate shared changes with the integrator. All current endpoints are same-origin Next.js route handlers, with JSON payloads and no authentication.

## Implementation status and client responsibilities

| Surface | Current behavior | Frontend rule |
| --- | --- | --- |
| `GET /api/health` | Demo/live discovery and optimization implementation flags true | Capability flags describe implementation, not key presence or verified price coverage |
| `POST /api/stores`, `mode: "demo"` | Works; fixed fictional stores, independent of postal code/radius | Label fictional stores and illustrative prices; never call them nearby |
| `POST /api/stores`, `mode: "live"` | Google Geocoding/Places; missing key 503; v1 real-store pricing unavailable | Render Maps/third-party attribution; do not substitute demo results |
| `POST /api/optimize` | Deterministic sample planner in demo; live illustrative planning rejected | Render feasible/infeasible/incomplete result; use v2 for real pricing |
| Catalog/price HTTP endpoints | Additive `/api/v2/catalog` and `/api/v2/pricing` | Adopt v2 explicitly for real quotes and provenance |

Frontend adoption is maintained separately. These routes return implemented domain results. Inputs use strict Zod schemas; output arithmetic invariants are tested rather than represented by executable response Zod schemas.

For the eventual journey, keep country/location, selected IDs, and preferences in one frontend flow state. Clear stores/results after location/mode changes and clear results after selection/preferences changes; ignore stale in-flight responses. Render store/attribution values as text and safe links. The backend owns store identity, price/nutrition provenance, constraints, and all calculations.

## Envelope and errors

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: {
      code: ApiErrorCode;
      message: string;
      details?: { path: string; message: string }[];
    }};
```

Responses include `Cache-Control: no-store` and `X-ShopMate-Contract-Version: 1`. Do not parse human messages to identify an error; branch on HTTP status and `error.code`. Error details include field paths, not rejected values or upstream payloads.

| HTTP status | Meaning |
| --- | --- |
| `200` | Successful request; optimization can still be feasible, infeasible, or incomplete |
| `400 invalid-json` | Body is not valid JSON |
| `422 invalid-request` | Invalid fields, country/currency mismatch, unknown IDs, or invalid country/mode selection |
| `404 not-found` | Live lookup cannot resolve the supplied geographic location/store |
| `429 rate-limited` | Route/provider quota limit |
| `501 not-implemented` | Valid request for a feature deferred from the foundation |
| `503 provider-not-configured` | Live provider lacks its credential or valid reviewed configuration |
| `502 provider-error` | Upstream provider failure, timeout, invalid or unverifiable payload |
| `500 internal-error` | Unexpected internal failure; sanitized before returning |

Stores/optimization routes implement the validation, configuration, quota and provider-error paths above. Next.js supplies `405` for unsupported methods; framework-level errors need not use this envelope. A valid empty store search is `200` with `stores: []`. A valid but impossible plan is an optimization domain result, not an HTTP error.

Live implementation must map missing credentials to 503, upstream quota to 429, deadlines/provider failures to 502, and unexpected failures to sanitized 500 responses. A provider returning no stores for an otherwise valid location is different from a geocoder failing to resolve that location (404). Never return raw exceptions, credentials, or key-bearing upstream URLs.

Unknown object fields are rejected. Numeric inputs must be JSON numbers; there is no string-to-number coercion. `mode` is always required. A missing/failed live provider must never silently switch to demo.

## `GET /api/health`

Current response:

```json
{
  "ok": true,
  "data": {
    "application": "ShopMate",
    "version": "0.1.0",
    "stage": "foundation",
    "capabilities": { "demoDiscovery": true, "liveDiscovery": true, "optimization": true }
  }
}
```

Update capability flags when the corresponding implementation actually works.

## `POST /api/stores`

### Request

```json
{
  "mode": "demo",
  "location": { "country": "CA", "postalCode": "m5v2t6" },
  "radiusKm": 5
}
```

`mode`: `demo | live`. `country`: `CA | US`. `radiusKm`: 1–50 inclusive; optional with a default of 5. CA input is trimmed, uppercased, space-normalized to `A1A 1A1`, and checked against permitted letter positions. US input accepts five digits or ZIP+4 with its hyphen; leading zeroes are preserved. Schema validation is syntactic; live Google geocoding establishes geographic existence/country.

### Success data: `StoreDiscoveryResult`

| Field | Contract |
| --- | --- |
| `mode` | Requested mode; no fallback |
| `location` | `{ country, postalCode, currency }`, normalized; CAD for CA, USD for US |
| `origin` | `{ label, coordinates }`; real geocoded origin in live mode, null coordinates in demo |
| `radiusKm` | Requested/defaulted radius |
| `stores` | `Store[]`, possibly empty; discovery may return more than three, selection allows up to three |
| `attributions` | `{ provider: "google-maps", displayName, uri }[]`; empty in demo |
| `notices` | User-facing provenance/limitations; display relevant notices |

A demo store has the following shape (one of the three returned fixtures):

```json
{
  "id": "demo-ca-clover",
  "name": "Clover Grocer",
  "address": "48 Clover Street · fictional address",
  "country": "CA",
  "chainId": null,
  "pricing": { "status": "illustrative", "profileId": "demo-ca-clover" },
  "source": "demo",
  "googlePlaceId": null,
  "coordinates": null,
  "distanceMeters": null,
  "googleMapsUri": null
}
```

A discovered Google store uses `source: "google"`, ID `google:<placeId>`, a non-null place ID/coordinates/Maps URI, and nonnegative `distanceMeters`. Distance is straight-line from the geocoded origin, not driving distance. `chainId` is a supported country-scoped chain or null. Real stores always have v1 pricing `{ status: "unavailable", profileId: null }`. Chain recognition never makes sample prices live; v2 separately validates actual branch pricing.

Demo ignores location/radius and explicitly says so. It must not imply the stores are nearby. Country selects independent CAD/USD fixtures. Coordinates and distances remain null. Demo requires no Google key.

Demo returns fictional stores without a provider call. Live uses country-restricted geocoding and bounded Places search with sanitized configuration/error states. Rendering attribution fields does not replace the official Google Maps logo/third-party attribution requirements.

## `POST /api/optimize`

### Request

```json
{
  "mode": "demo",
  "country": "CA",
  "storeIds": ["demo-ca-cedar", "demo-ca-clover", "demo-ca-orchard"],
  "preferences": {
    "weeklyBudget": { "amountCents": 8000, "currency": "CAD" },
    "mealCount": 5,
    "servingsPerMeal": 2,
    "dietaryRestrictions": ["vegetarian"],
    "excludedIngredientIds": ["peanut-butter"],
    "excludedAllergens": ["peanuts"],
    "nutritionPriorities": ["high-protein"],
    "objective": "balanced"
  }
}
```

- Select 1–3 distinct IDs from discovery in the same country/mode. IDs are resolved and validated server-side. There is no session or database requirement.
- `weeklyBudget.amountCents` is an integer from 1 to 1,000,000; currency must match country. This is the maximum **full package purchase** total for the planned meals.
- `mealCount` is 1–14 meal slots. `servingsPerMeal` is 1–8 and applies to every slot. Neither means seven full days of nutrition.
- `dietaryRestrictions`: unique values from `vegetarian`, `vegan`, `gluten-free`. All selected restrictions must hold.
- `excludedIngredientIds`: up to 50 unique canonical catalog IDs; unknown IDs are rejected rather than ignored.
- `excludedAllergens`: unique values from `milk`, `egg`, `fish`, `shellfish`, `tree-nuts`, `peanuts`, `wheat`, `soy`, `sesame`.
- `nutritionPriorities`: `[]` or `["high-protein"]`. This is a soft ranking preference, not a hard minimum.
- `objective`: `minimize-cost | maximize-nutrition | balanced`.

Do not send store objects, client-provided prices, recipes, nutritional assertions, or chain mappings. The route derives them from server-owned providers/catalog data.

V1 demo returns a deterministic optimization result; invalid input returns 400/422. Live illustrative planning is rejected with 422 after authoritative ID resolution; use `/api/v2/optimize` for real quotes.

Known store/ingredient lookup and live-country verification are enforced before results. Unknown IDs return 422 field details. Selecting several stores means comparing a full basket at each; no endpoint supports splitting purchases across stores.

### Success data: `OptimizationResult`

All result variants contain `mode`, `country`, `currency`, `pricingBasis: "illustrative"`, `notices`, and `search: { evaluatedCombinations, exhaustive }`. These are domain variants inside `ok: true`.

| Status | Fields and meaning |
| --- | --- |
| `feasible` | `optimality: "proven" \| "best-found"`; plan, complete/unavailable baskets, recommended store, total, remaining budget, reuse, and optional basket savings |
| `infeasible` | `reason: "budget" \| "dietary-constraints" \| "pricing-unavailable"`, `message`, `minimumKnownCost: Money \| null`; must have exhausted the documented candidate space |
| `incomplete` | `reason: "search-limit"`, `message`; capped search found no feasible plan and cannot prove infeasibility |

Feasible fields:

- `meals: { slot, recipeId, servings }[]`: zero-based consecutive slots, exactly `mealCount`; quantities scale from each recipe's full yield. Repeated recipes remain separate slots.
- `requirements: { ingredientId, quantity, unit, usedByRecipeIds }[]`: aggregated canonical quantities, sorted by ingredient ID. Recipe IDs are unique references; repeated slots still contribute all quantities.
- `estimatedTotalNutrition: Nutrition`: sum for all servings/slots. Each nutrient field is an estimate, not a per-person/day recommendation.
- `baskets: BasketComparison[]`: one entry per selected store. A complete basket has `storeId`, `lines`, `total`, and `basis: "illustrative"`. An unavailable basket has `storeId`, `missingIngredientIds`, and `reason`, with **no total**.
- Each `BasketLine` includes `ingredientId`, `productId`, `required`, `packageCount`, `purchased`, `leftover`, `unitPrice`, and `subtotal`. Quantity fields contain `{ quantity, unit }`. Package counts are integers; all money uses the same explicit currency.
- `recommendedStoreId`: a complete selected-store basket with the lowest cost for the chosen plan. `total` equals that basket's total and does not exceed budget. `budgetRemaining` equals budget minus total.
- `ingredientReuse`: shared ingredient IDs/recipe IDs, whole `packagesAvoided`, and `estimatedSavings`, comparing separate-meal package purchases with consolidated purchases at the recommended store.
- `basketSavings`: null if no second complete comparable basket exists; otherwise `{ comparedToStoreId, amount }` for the identical plan at another selected store. Do not imply an unverified market-wide lowest price.
- `explanations`: deterministic, structured-data-derived statements suitable for UI copy.

`optimality: "proven"` requires an exhaustive search over the documented candidate set. `best-found` can have `search.exhaustive: false`. An infeasible result must have `search.exhaustive: true`; an incomplete result must have `false`. The engine must enforce these invariants; TypeScript alone does not prove arithmetic or feasibility.

## Integration boundaries

`src/server/discovery/provider.ts`: `discover(request)` and `resolveStores(ids, country)`. Demo and live resolution exist. Live Place Details revalidates ID/country/grocery/operating status without trusting the client. The internal pricing identity omits distances because it has no original search origin.

`src/server/pricing/provider.ts`: `getOffers(store, productIds)`. `status: "available"` means an illustrative catalog can be read; missing product IDs can still be absent from the returned offers. The engine must detect incomplete baskets.

`src/server/optimization/engine.ts`: implemented `optimize(request, resolvedStores, pricingProvider)` for demo, and a shared package-snapshot calculation core for v2 real quotes. Catalog multiset search allows repeats, with a 20,000-evaluation default cap; scoring/version details are in `src/server/README.md`.

## V2 verified-pricing contract

Implemented additive routes use the same `ApiResponse<T>` envelope/error codes and no-store policy, with `X-ShopMate-Contract-Version: 2` for success and errors. Current v1 paths/types/IDs stay intact. Credentials and reviewed mappings are not supplied by this contract; see [PRICING.md](PRICING.md). Synthetic route/provider integration tests pass; application-key end-to-end access remains unverified.

V2 preserves country/currency, ingredient/recipe IDs, units, preference fields, and feasible/infeasible/incomplete semantics. `mode` still selects discovery provenance; **v2 live permits verified prices or unavailable pricing only**, while v2 demo remains explicitly illustrative. This tightens the intended product behavior without reinterpreting the existing v1 illustrative-only types. Never cast a real offer into `ProductOffer` or rename a sample offer “live.”

### Endpoint sequence

| Endpoint | Request | Success `data` |
| --- | --- | --- |
| `GET /api/v2/catalog?country=CA` | Exactly one required `country=CA\|US` | `{ catalogVersion, country, currency, ingredients: Ingredient[], recipes: Recipe[], products: ProductPackage[] }`; local curated metadata, estimated nutrition, no provider prices |
| `POST /api/v2/stores` | Existing `StoreDiscoveryRequest` fields/limits | Existing `StoreDiscoveryResult`, except stores use `StoreV2` below; actual branch names/addresses only from discovery; demo remains separate |
| `POST /api/v2/pricing` | `{ mode, country, storeIds, catalogVersion }`; 1–3 distinct discovered IDs | `PricingResultV2` below, covering the catalog's candidate ingredients; an offer subset does not promise a complete basket |
| `POST /api/v2/optimize` | Existing `OptimizationRequest` plus required `catalogVersion` | `OptimizationResultV2` below; server independently re-resolves IDs and fetches current offers once for this run |
| `GET /api/v2/deals?country=CA&province=ON` | Exactly one country CA and province ON/QC; unknown/duplicate fields rejected | `{ country, province, basis: "advertised", retrievedAt, deals, notices }`; public regional Bidou ads, never branch offers or optimizer eligible |

`catalogVersion` is an opaque server-owned catalog revision; a mismatch returns `422 invalid-request` at `catalogVersion` and the client reloads the catalog. New provider packages receive stable namespaced IDs rather than changing the meaning of existing `pkg-*` fixtures. Price preflight is informational: do not send prices or provider-store mappings back to optimization. The result uses one internally consistent offer set per run; preflight prices can change before optimization. No database or retained Google search payload is required.

### Stores and branch verification

`StoreV2` retains every existing store field and the `source: "demo" | "google"` union/IDs. Replace only its `pricing` field with:

```ts
type PriceChannel = "in-store" | "pickup" | "delivery";
type StorePricingV2 =
  | { status: "illustrative"; profileId: PricingProfileId } // demo only
  | { status: "verified-capable"; providerId: string; channel: PriceChannel } // live only
  | { status: "unavailable"; profileId: null; reason: string };
```

`verified-capable` means the configured adapter has established the exact provider branch mapping; it is a capability, not proof that all ingredients have prices/stock or legal display rights. The server owns this mapping and revalidates it; a chain-name match or an organization-level retailer key is insufficient. Unmatched/ambiguous stores remain discoverable with unavailable pricing. No real addresses, place IDs, or price examples are invented in this contract. Access instructions and terms/coverage investigation are in [PRICING.md](PRICING.md).

### Offers, freshness, and missing coverage

These shapes reuse existing `Money`, `ProductPackage`, `ProductOffer`, and `Country`. Full implemented definitions, including `RetailProductObservation`, are in `src/contracts/pricing-v2.ts`:

```ts
interface VerifiedOffer {
  product: ProductPackage; // exact SKU's mapped ingredient and usable package content
  price: Money;           // full package price, never prorated ingredient cost
  basis: "verified";
  available: true;
  observation: RetailProductObservation; // source identity, package, prices, conditions, stock, scope and timestamps
  provenance: {
    providerId: string;
    providerStoreId: string;
    providerProductId: string;
    channel: PriceChannel;
    priceType: "regular" | "unconditional-sale";
    retrievedAt: string;             // ISO 8601 UTC; our successful retrieval time
    providerUpdatedAt: string | null; // only when actually supplied by provider
    expiresAt: string;               // app freshness deadline, not a checkout guarantee
    sourceUrl: string | null;        // safe public product link, never an API/key URL
  };
}
type PricingSetV2 =
  | { status: "available"; storeId: string; basis: "illustrative";
      offers: ProductOffer[]; missingIngredientIds: string[] }
  | { status: "available"; storeId: string; basis: "verified";
      offers: VerifiedOffer[]; missingIngredientIds: string[] }
  | { status: "unavailable"; storeId: string;
      reason: "unsupported-store" | "provider-not-configured" | "provider-error"
        | "rate-limited" | "no-usable-offers";
      message: string };
interface PricingResultV2 {
  mode: "demo" | "live";
  country: Country;
  currency: "CAD" | "USD";
  catalogVersion: string;
  stores: PricingSetV2[]; // exactly one per selected ID, in requested order
  notices: string[];
}
```

All money must be positive integer cents in the selected currency. A verified product must have a reviewed ingredient/preparation-state mapping, positive usable content in the canonical unit, and valid package metadata. Reject expired/missing prices, ambiguous sizes, unavailable items, and unsupported substitutions. The initial adapter excludes variable-weight, loyalty/coupon/minimum-spend offers; unconditional sales require known validity. Never infer that “400 g canned” means 400 g drained or that ml equals g.

Each adapter publishes its supported countries/branches, channel, freshness TTL, and price-eligibility rules in server configuration. `expiresAt` is the earlier of that TTL deadline and any known offer expiry. `retrievedAt` does not claim the retailer updated the price at that instant. Do not combine different channels in a comparison. Show channel, retrieval time, excluded tax/fees/deposits, and price-change limitations near real-price totals.

`missingIngredientIds` is sorted relative to all candidate catalog ingredients, not a selected meal basket. A store may be available with partial coverage or zero offers; the engine determines completeness for each chosen plan. A failed store can coexist with successful sets in a 200 response. If no selected store can be queried due to missing configuration, return 503; if all fail due to upstream quota, return 429; other wholly failed upstream requests return 502 (with 502 taking precedence for mixed upstream failures). Unsupported stores or successful queries with no usable offers are domain unavailability, not invented zero-cost baskets.

### Optimization result and invariants

`OptimizationResultV2` keeps the v1 discriminated result variants and fields, with these coordinated changes:

| Field | V2 semantics |
| --- | --- |
| `pricingBasis` | `"illustrative"` for demo, `"verified"` for live; never mixed |
| `catalogVersion`, `optimizerVersion` | Required opaque catalog/scoring-rule revisions |
| `pricing` | Required `PricingResultV2` containing the exact offers used for this run, including provenance/package metadata |
| `search` | Retain `evaluatedCombinations` and `exhaustive`; add `evaluationLimit` (positive integer) and sorted `candidateRecipeIds` so the candidate space is explicit |
| `baskets` (feasible only) | Preserve complete/unavailable union; complete basket `basis` matches `pricingBasis`. Unavailable baskets still have no total. Every selected store gets an entry. |
| `BasketLine` | Keep v1 fields. `unitPrice` is the price of one whole package. Allow several products for an ingredient; allocated `required` quantities across those lines sum to that ingredient's requirement, and each `purchased = required + leftover`. |

Scale meals before aggregation; sum purchase subtotals in cents. Require the country's currency and full priced ingredient coverage for a complete basket; verified comparisons must also use one channel. `recommendedStoreId`, `total`, and `budgetRemaining` refer to the cheapest complete selected-store basket for that plan. Equal totals break by store ID; plan-score ties use complete cost, recipe-ID multiset, then store ID. Only complete identical-plan baskets support `basketSavings`. Multiple selected stores do not imply a split-store shopping route.

Keep hard constraints and the high-protein soft priority unchanged. Nutrition stays estimated. Record objective/scoring rules under `optimizerVersion`; ingredient reuse and package leftovers can influence balanced ranking, but do not imply actual measured waste prevention. After a cap, return feasible `best-found` or `incomplete`, never proven optimality/infeasibility. An exhausted search proves only the explicitly documented catalog/candidate space. When no plan has full pricing, use `pricing-unavailable` after an exhaustive search rather than implying dietary or budget infeasibility.

Automated tests cover branch verification, provenance, freshness, units/packages, basis/currency protection, unknown IDs, partial failures, complete basket totals, budget edges, exclusions and capped search. Production HTTP smoke checks exercise v2 demo routes; a synthetic Google/Reef test exercises two-store live-mode composition. Public source trials, the successful live Bidou reader and missing credentialed coverage are documented separately in [PRICING.md](PRICING.md). Frontend/browser adoption and a complete credentialed basket run remain pending; mocked HTTP is not verification of a production integration.
