# Shared API contract — version 1

Reviewed November 7, 2026. The authoritative **current v1** TypeScript definitions are in `src/contracts/`; no runtime/type/schema changes were made in this review. The [recovery plan](../PLAN.md) records implementation evidence and delivery gates. The [proposed v2 extension](#proposed-v2-verified-pricing-contract-not-implemented) below specifies the missing verified-pricing boundary without pretending v1 supports it.

These contracts let frontend and backend work against one interface. Coordinate shared changes with the integrator. All current endpoints are same-origin Next.js route handlers, with JSON payloads and no authentication.

## Implementation status and client responsibilities

| Surface | Current behavior | Frontend rule |
| --- | --- | --- |
| `GET /api/health` | Works; only demo discovery is enabled | Capability flags describe implementation, not key presence or verified price coverage |
| `POST /api/stores`, `mode: "demo"` | Works; fixed fictional stores, independent of postal code/radius | Label fictional stores and illustrative prices; never call them nearby |
| `POST /api/stores`, `mode: "live"` | Valid request returns 501, regardless of credentials | Keep the error visible; do not manufacture/fallback to demo results |
| `POST /api/optimize` | Schema-valid request returns 501 in either mode | Do not synthesize a plan from a loading animation or scaffold response |
| Catalog/price HTTP endpoints | None exist | Current server-rendered preview reads local data directly; provider interfaces are not public endpoints |

The entry UI currently calls neither POST route: it only navigates to `/demo?country=CA|US` and discards the entered location from the journey. The following optimization success types are reserved contracts, not working responses. Response/domain arithmetic invariants are not executable response Zod schemas today.

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
| `404 not-found` | Future live lookup cannot resolve the supplied geographic location/store |
| `429 rate-limited` | Future route/provider quota limit |
| `501 not-implemented` | Valid request for a feature deferred from the foundation |
| `503 provider-not-configured` | Future implemented live provider lacks its server credential |
| `502 provider-error` | Future upstream provider failure |
| `500 internal-error` | Future unexpected internal failure; sanitize before returning |

Only 200/400/422/501 paths are currently implemented by the stores/optimization routes. Next.js supplies `405` for unsupported methods; framework-level errors need not use this envelope. A valid empty store search is `200` with `stores: []`. A valid but impossible plan is an optimization domain result, not an HTTP error.

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
    "capabilities": { "demoDiscovery": true, "liveDiscovery": false, "optimization": false }
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

`mode`: `demo | live`. `country`: `CA | US`. `radiusKm`: 1–50 inclusive; optional with a default of 5. CA input is trimmed, uppercased, space-normalized to `A1A 1A1`, and checked against permitted letter positions. US input accepts five digits or ZIP+4 with its hyphen; leading zeroes are preserved. Validation is syntactic; geographic existence is Agent B's responsibility.

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

A future Google store uses `source: "google"`, ID `google:<placeId>`, a non-null place ID/coordinates/Maps URI, and nonnegative `distanceMeters`. Distance is straight-line from the geocoded origin, not driving distance. `chainId` is a supported country-scoped chain or null. Pricing is either `{ status: "illustrative", profileId }` or `{ status: "unavailable", profileId: null }`. A real store match still has sample prices; it is never labeled live retailer pricing.

Demo ignores location/radius and explicitly says so. It must not imply the stores are nearby. Country selects independent CAD/USD fixtures. Coordinates and distances remain null. Demo requires no Google key.

**Foundation:** demo returns 200; live returns 501 regardless of credentials. **Agent B:** implement live Google discovery and server-authoritative ID resolution with the same shape. Rendering the attribution fields does not replace the official Google Maps logo/third-party attribution requirements.

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

- Select 1–3 distinct IDs from discovery in the same country/mode. Prefix validation is not enough: the future route must resolve and validate IDs server-side. There is no session or database requirement.
- `weeklyBudget.amountCents` is an integer from 1 to 1,000,000; currency must match country. This is the maximum **full package purchase** total for the planned meals.
- `mealCount` is 1–14 meal slots. `servingsPerMeal` is 1–8 and applies to every slot. Neither means seven full days of nutrition.
- `dietaryRestrictions`: unique values from `vegetarian`, `vegan`, `gluten-free`. All selected restrictions must hold.
- `excludedIngredientIds`: up to 50 unique canonical catalog IDs. The future engine must reject unknown IDs rather than ignoring typos.
- `excludedAllergens`: unique values from `milk`, `egg`, `fish`, `shellfish`, `tree-nuts`, `peanuts`, `wheat`, `soy`, `sesame`.
- `nutritionPriorities`: `[]` or `["high-protein"]`. This is a soft ranking preference, not a hard minimum.
- `objective`: `minimize-cost | maximize-nutrition | balanced`.

Do not send store objects, client-provided prices, recipes, nutritional assertions, or chain mappings. The route derives them from server-owned providers/catalog data.

**Foundation:** valid requests return 501 with `error.code: "not-implemented"`; invalid input returns 400/422. No fake feasible or infeasible plan is generated.

Here “valid” means schema-valid. Known store/ingredient lookup and live-country verification are still pending: well-formed unknown IDs can pass the schema before the 501. Before implementation returns results, resolve store IDs and reject unknown exclusion IDs with 422 field details. Selecting several stores means comparing a full basket at each; v1 does not support splitting purchases across stores.

### Future success data: `OptimizationResult`

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

`src/server/discovery/provider.ts`: `discover(request)` and `resolveStores(ids, country)`. Demo resolution exists. Future live resolution must revalidate country/chain metadata without trusting the client.

`src/server/pricing/provider.ts`: `getOffers(store, productIds)`. `status: "available"` means an illustrative catalog can be read; missing product IDs can still be absent from the returned offers. The engine must detect incomplete baskets.

`src/server/optimization/engine.ts`: `optimize(request, resolvedStores, pricingProvider)`. This interface is reserved for Agent C. Main coordinates live-provider composition after B and C merge.

## Proposed v2 verified-pricing contract (not implemented)

This is a documentation design for the intended real-price flow. **No `/api/v2/*` route, type, response validator, pricing credential, or adapter below exists yet.** Keep current v1 paths/types/IDs intact. Implement v2 types, strict schemas, routes, and shared contract tests together before the frontend sends these payloads. New routes will use the same `ApiResponse<T>` envelope/error codes and no-store policy, with `X-ShopMate-Contract-Version: 2`. Currently nonexistent v2 paths simply return the framework's 404; they do not already return typed errors.

V2 preserves country/currency, ingredient/recipe IDs, units, preference fields, and feasible/infeasible/incomplete semantics. `mode` still selects discovery provenance; **v2 live permits verified prices or unavailable pricing only**, while v2 demo remains explicitly illustrative. This tightens the intended product behavior without reinterpreting the existing v1 illustrative-only types. Never cast a real offer into `ProductOffer` or rename a sample offer “live.”

### Endpoint sequence

| Proposed endpoint | Request | Success `data` |
| --- | --- | --- |
| `GET /api/v2/catalog?country=CA` | Exactly one required `country=CA\|US` | `{ catalogVersion, country, currency, ingredients: Ingredient[], recipes: Recipe[], products: ProductPackage[] }`; local curated metadata, estimated nutrition, no provider prices |
| `POST /api/v2/stores` | Existing `StoreDiscoveryRequest` fields/limits | Existing `StoreDiscoveryResult`, except stores use `StoreV2` below; actual branch names/addresses only from discovery; demo remains separate |
| `POST /api/v2/pricing` | `{ mode, country, storeIds, catalogVersion }`; 1–3 distinct discovered IDs | `PricingResultV2` below, covering the catalog's candidate ingredients; an offer subset does not promise a complete basket |
| `POST /api/v2/optimize` | Existing `OptimizationRequest` plus required `catalogVersion` | `OptimizationResultV2` below; server independently re-resolves IDs and fetches current offers once for this run |

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

`verified-capable` means a configured, authorized adapter has established the exact provider branch mapping; it is a capability, not proof that all ingredients have prices/stock. The server owns this mapping and must revalidate it; a chain-name match or an Instacart organization-level retailer key is insufficient. Unmatched/ambiguous stores remain discoverable with unavailable pricing. No real addresses, place IDs, or price examples are invented in this contract. Provider access requirements and official documentation are linked in [PLAN.md](../PLAN.md#external-services-and-access-gates).

### Offers, freshness, and missing coverage

The proposed shape reuses existing `Money`, `ProductPackage`, `ProductOffer`, and `Country` definitions where stated. New types in this section are documentation only:

```ts
interface VerifiedOffer {
  product: ProductPackage; // exact SKU's mapped ingredient and usable package content
  price: Money;           // full package price, never prorated ingredient cost
  basis: "verified";
  available: true;
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

| Field | Proposed v2 semantics |
| --- | --- |
| `pricingBasis` | `"illustrative"` for demo, `"verified"` for live; never mixed |
| `catalogVersion`, `optimizerVersion` | Required opaque catalog/scoring-rule revisions |
| `pricing` | Required `PricingResultV2` containing the exact offers used for this run, including provenance/package metadata |
| `search` | Retain `evaluatedCombinations` and `exhaustive`; add `evaluationLimit` (positive integer) and sorted `candidateRecipeIds` so the candidate space is explicit |
| `baskets` (feasible only) | Preserve complete/unavailable union; complete basket `basis` matches `pricingBasis`. Unavailable baskets still have no total. Every selected store gets an entry. |
| `BasketLine` | Keep v1 fields. `unitPrice` is the price of one whole package. Allow several products for an ingredient; allocated `required` quantities across those lines sum to that ingredient's requirement, and each `purchased = required + leftover`. |

Scale meals before aggregation; sum purchase subtotals in cents. Require the country's currency and full priced ingredient coverage for a complete basket; verified comparisons must also use one channel. `recommendedStoreId`, `total`, and `budgetRemaining` refer to the cheapest complete selected-store basket for that plan. Equal totals break by store ID; plan-score ties use complete cost, recipe-ID multiset, then store ID. Only complete identical-plan baskets support `basketSavings`. Multiple selected stores do not imply a split-store shopping route.

Keep hard constraints and the high-protein soft priority unchanged. Nutrition stays estimated. Record objective/scoring rules under `optimizerVersion`; ingredient reuse and package leftovers can influence balanced ranking, but do not imply actual measured waste prevention. After a cap, return feasible `best-found` or `incomplete`, never proven optimality/infeasibility. An exhausted search proves only the explicitly documented catalog/candidate space. When no plan has full pricing, use `pricing-unavailable` after an exhaustive search rather than implying dietary or budget infeasibility.

Before enabling v2, add contract/route/provider/engine tests for branch verification, provenance, freshness boundaries, unit/package mappings, no mixed bases/channels/currencies, unknown IDs, partial failures, complete basket totals, budget edges, exclusions, deterministic ties, and capped search. Add a browser journey against implemented routes and separately document credentialed provider smoke results. A typed proposal or mocked HTTP fixture is not verification of a real integration.
