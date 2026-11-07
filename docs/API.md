# Shared API contract — version 1

The authoritative TypeScript definitions are in `src/contracts/`. These contracts let the frontend, discovery, and optimization agents work independently. Coordinate shared changes with main. All endpoints are same-origin Next.js route handlers, with JSON payloads and no authentication in this MVP.

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

### Future success data: `OptimizationResult`

All result variants contain `mode`, `country`, `currency`, `pricingBasis: "illustrative"`, `notices`, and `search: { evaluatedCombinations, exhaustive }`. These are domain variants inside `ok: true`.

| Status | Fields and meaning |
| --- | --- |
| `feasible` | `optimality: "proven" | "best-found"`; plan, complete/unavailable baskets, recommended store, total, remaining budget, reuse, and optional basket savings |
| `infeasible` | `reason: "budget" | "dietary-constraints" | "pricing-unavailable"`, `message`, `minimumKnownCost: Money | null`; must have exhausted the documented candidate space |
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
