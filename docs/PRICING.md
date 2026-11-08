# Real pricing: implementation and access

Checked November 7, 2026. No provider credentials were supplied. The repeatable integration tests use synthetic responses; they do not prove production account access. No frontend files were changed for this pricing integration.

## What is implemented

- `/api/v2/catalog`, `/stores`, `/pricing`, `/optimize`: the additive shared v2 contract in [API.md](API.md) and `src/contracts/pricing-v2.ts`.
- Reef Loblaws-family Canada adapter for explicit `loblaw`, `nofrills`, `superstore`, `zehrs`, `fortinos` branches, using the online pickup catalogue. The branch must sell online with store pickup. This is not a claim about in-store shelf prices.
- Reef Kroger-family US adapter for explicit locations and in-store regular prices. Returned banner name/address must match the reviewed branch. Other Kroger-family banners have not been exercised live.
- Official Kroger Public Products/Locations adapter (`providerId: "kroger"`), now connected to v2 pricing/optimization using server-side client-credentials OAuth. Exact US banner/address agreement can resolve the retailer branch automatically. Reviewed product and usable-content mappings remain required. This adapter has synthetic integration coverage, **no credentialed live test**. See [current backend handoff](BACKEND-PRICING-HANDOFF.md).
- The same deterministic package/meal optimizer handles real or illustrative snapshots. Live requests never substitute sample prices; unsupported branches remain unavailable. Complete baskets buy whole packages and include pantry ingredients. Nutrition/allergens remain sample estimates.
- `/api/v2/deals?country=CA&province=ON` (also QC): public Bidou RSS, dated and attributed, explicitly regional/unknown stock/unknown expiry. Never optimizer eligible.
- Explicit demo mode remains usable without keys. V1 shapes stay intact; sample optimization now requires `mode: "demo"`. Real planning uses v2.

## What genuinely returned data

These were successful **public Reef playground** searches performed in a browser, not copied documentation responses and not requests authenticated with a ShopMate-owned key. `meta.mode` was `live` and `cache_hit` was false. They establish source availability at the tested locations, not complete meal coverage, checkout guarantees, data licensing, or an authenticated ShopMate end-to-end deployment.

| Source trial | Exact returned context | Observed product/price |
| --- | --- | --- |
| Loblaws Canada | Explicit banner `loblaw`, store `1032`; no default store | PC Organics Organic Long Grain Brown Rice, 900 g, SKU `21166890_EA`, CAD 5.50, in stock |
| No Frills Canada | Explicit banner `nofrills`, store `3683`; no default store | Same SKU/package, CAD 4.99, in stock |
| Kroger US | Explicit location `01400929`, University Plaza, 1 W Corry St, Cincinnati OH 45219 | Kroger Long Grain Brown Rice, 32 oz, product `0001111089874`, checked GTIN14 `00011110898746`, USD 1.89 regular, stock HIGH, in-store available |

The Loblaws `stores` trial also resolved `1032` to **200 Bullock Dr, Markham ON L3P 1W2**, online selling/store pickup. The No Frills search trial did not independently establish its address. Do not turn these observations into default application mappings or reuse them as current prices. The [public playground](https://reefapi.com/playground?action=search&engine=loblaws) is separate from production authentication; its shared credentials are not embedded in this repository.

Direct requests without credentials returned **401** for Reef Loblaws, Reef ALDI US, official Kroger Products, Bidou JSON API and API.SH Wegmans. An authorization error proves the access gate only. Bidou's public Ontario RSS returned 200; the actual reader's live test successfully parsed dated CAD offers. Full real two-store optimization was verified with **mocked Google/Reef HTTP**, not with production keys. No complete real basket or authenticated Google-to-Reef run is claimed.

## Provider decisions

| Provider | Access, coverage and cost investigation | ShopMate status |
| --- | --- | --- |
| [Reef Loblaws](https://reefapi.com/docs/loblaws) | Application key in `x-api-key`. Five requested banners documented; store discovery/search/product endpoints, explicit branch IDs, CAD/stock/pack metadata. Advertises 1,000 signup credits; endpoint credits vary. | Implemented, awaiting application credentials and reviewed branch/SKU mappings. Loblaws/No Frills public trials succeeded; Superstore/Zehrs/Fortinos not live-tested. |
| [Reef Kroger](https://reefapi.com/docs/kroger) | Same key; explicit location required. US regular/sale prices, GTIN14, stock, shopping channels. Search currently returns first 24 items. Sales may require Kroger membership. | Implemented regular-price in-store adapter, awaiting application credentials/mappings. Public Kroger trial succeeded. Ralphs/Fred Meyer/Harris Teeter untested. |
| [Bidou](https://bidou.store/en/api) | JSON key is free by project request; truthful User-Agent and Bidou/observation-date attribution required. JSON prices are banner/province scoped, with one-hour provider caching. Docs list ON Loblaws/No Frills/Zehrs/RCSS/Fortinos/Food Basics. Site's older methodology still emphasizes QC. Walmart ON completeness is unestablished; no verified FreshCo/Metro ON support. Published usage guidance: 30/minute, at most 5 concurrent and about 3,000/day. | Public regional ON RSS works and is integrated as deals. JSON returned 401. Province/banner observations do not establish selected-branch inventory/prices; unsuitable as a branch-complete optimizer feed without additional evidence. |
| [Yugenox weekly flyers](https://yugenox-data.vercel.app/retail/weekly-flyer-api) | Paid Apify actor `yugenox/flipp-flyer-deals-scraper`; advertised $1.50/1,000 retained deals plus detail/run costs. Regional flyer and optional store/online rows are different scopes. No paid run or token available. | Investigated, not run/integrated. Publisher claims are not a verified redistribution license or reliability guarantee. Official [Flipp FlyerKit](https://api.flipp.com/) requires an account-manager token; use an approved feed before displaying its data. Flyer-only offers cannot fill all required ingredients. |
| [Official Kroger](https://www.postman.com/kroger/the-kroger-co-s-public-workspace/documentation/ki6utqb/kroger-public-apis) | Register OAuth client; product prices require location selection and granted `product.compact` access. Access/quotas/terms depend on account. | `kroger.ts` now implements the v2 optimizer adapter; `kroger-probe.ts` remains an isolated access probe. No credentials supplied; authenticated access and complete real baskets remain unverified. |
| [Reef ALDI US](https://reefapi.com/aldi-us-api) | Same Reef key. Documented stores/search/offers/promotions; must choose exact store and explicit `service_type`, because default delivery prices are not interchangeable with in-store. 2–3 credits per documented call. | Keyless documented POST returned 401. No successful product trial or adapter; kept outside optimizer. |
| [API.SH Wegmans](https://api.sh/docs/wegmans-search) | Key at app.api.sh, `x-api-key`; `GET /wegmans/v1/search?q=…&store_id=…&fulfilment=instore`. [Current pricing](https://api.sh/pricing) advertises 1,000 free monthly credits; $15 minimum top-up, $2/1,000 PAYG credits or $1/1,000 on monthly plans; verify account/endpoint costs before use. | Keyless request returned 401. No authenticated response schema/branch data established. No guessed production adapter or Buffalo coverage claim. |
| [Walmart Online Pickup & Delivery](https://www.walmart.io/docs/dv-dsd-api/v1/try-our-apis-with-swagger) | Walmart.io subscription/partner access for localized consumer product/ZIP data. OPD overview was inaccessible during investigation. Seller Marketplace APIs are a different service. | Requires approved subscription/partner credentials and permission for this use. No authenticated test or adapter. |

Reef [terms](https://reefapi.com/terms) do not automatically grant every retailer's downstream redistribution rights. Before public launch, establish provider/retailer display and comparison rights, source attribution requirements, and provider-side billing limits. No CAPTCHA, authentication or anti-bot restriction was bypassed. Do not treat a provider marketing page or working HTTP request as legal approval.

## Obtain and configure credentials

1. Copy `.env.example` to your local `.env.local` (do not commit it).
2. **Google discovery:** in [Google Cloud Console](https://console.cloud.google.com/), create/select a project, attach billing, enable **Geocoding API** and **Places API (New)**, create a server key and restrict it to those APIs and your backend's supported deployment restrictions. Set `GOOGLE_MAPS_API_KEY`. Set provider quotas. No browser/public key is needed. Google logo/third-party attributions, public Terms/Privacy and deployment controls remain frontend/live-launch requirements in [DEPLOYMENT.md](DEPLOYMENT.md).
3. **Implemented real-price adapters:** create an account at [Reef signup](https://reefapi.com/signup), obtain **your own** API key from the dashboard and set `REEF_KEY`. Confirm available credits, endpoint charges, permitted use and quota/spend limits in that account. Restart Next after changing environment settings. A key alone does not supply branch/product mappings.
4. Configure reviewed `SHOPMATE_PRICING_STORES` and `SHOPMATE_PRICING_PRODUCTS` JSON arrays as below. Start with six ingredients for `chickpea-rice-bowl` at two Canadian branches; obtain SKU/net/drained-content evidence separately for each retailer. Do not invent evidence to make a basket complete. `/api/v2/pricing` reports missing coverage.
5. Validate with the opt-in credentialed probe and a real v2 discovery/pricing/optimization request before claiming the application works live. The probe is intentionally bounded to three configured branches and one searched product each. The probe alone does not prove a full basket or Google-to-provider mapping.

Alternatively, configure **official Kroger** with `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`. Register a production application with Public Products/Locations access. Add reviewed product mappings with `providerId: "kroger"`, the actual provider banner name as `retailer`, and actual product IDs. `SHOPMATE_PRICING_STORES` may remain empty for US branches whose Google street/city/state/ZIP and banner match exactly one returned Kroger location. An explicit reviewed binding is also supported (`providerId: "kroger"`, `country: "US"`, `channel: "in-store"`, eight-digit provider location ID). Neither chain names nor Google IDs are converted into guessed location IDs. No Canadian official-Kroger coverage is offered.

Other access/setup notes:

- **Bidou JSON:** email **hello@bidou.store** yourself with project name, intended use and contact; request a free project key and confirm Ontario retailer/scope rights. Use `X-Bidou-Key` plus a truthful User-Agent. No email was sent and no Bidou JSON credential variable is consumed by ShopMate yet. The integrated RSS reader needs no key.
- **Official Kroger:** the same credentials now power production v2 pricing and the isolated probe. `KROGER_PROBE_POSTAL_CODE` is only needed for the standalone probe. Run `tests/pricing-official-live.test.ts` with opt-in and a reviewed official branch/SKU mapping to exercise the production adapter. Confirm the application's actual grants; registration is not evidence of coverage.
- **API.SH Wegmans:** sign up at [app.api.sh](https://app.api.sh/), create a scoped API key, configure account daily/monthly credit caps and confirm the Wegmans endpoint's charge. Its docs use `APISH_KEY`; ShopMate does **not** consume it yet. A future integration must verify the exact Buffalo branch, `store_id`, `fulfilment=instore`, returned schema and package mappings.
- **ALDI through Reef:** same `REEF_KEY`, but there is no ALDI adapter. First prove `/aldi-us/v1/stores` and exact-store searches with an explicit channel.
- **Yugenox:** use the linked Apify actor in your own account, review actor/Flipp rights and per-result billing, then obtain an account API token only if approved. ShopMate does not read an `APIFY_TOKEN` or trigger runs.
- **Walmart OPD:** request access through [Walmart.io](https://walmart.io/) onboarding/subscriptions/contact, describe branch-specific comparison use, obtain approval and that service's credentials. Exact grants/header requirements must be supplied by the approved integration; none are assumed or configured here.

### Reviewed branch configuration

`SHOPMATE_PRICING_STORES` is a JSON array. All IDs and addresses come from actual Google/retailer results, reviewed as the **same physical branch**; no automatic chain fallback is used. Example **template**, not a real location:

```json
[
  {
    "googlePlaceId": "REPLACE_WITH_ACTUAL_GOOGLE_PLACE_ID",
    "providerId": "reef-loblaws",
    "retailer": "No Frills",
    "country": "CA",
    "providerStoreId": "REPLACE_WITH_PROVIDER_STORE_ID",
    "channel": "pickup",
    "banner": "nofrills",
    "address": {
      "line1": "REPLACE WITH EXACT STREET ADDRESS",
      "city": "REPLACE WITH CITY",
      "region": "ON",
      "postalCode": "REPLACE WITH FULL POSTAL CODE"
    }
  }
]
```

Google exposes `google:PLACE_ID`; configure only the part after `google:`. Use Reef `/loblaws/v1/stores` with the correct banner and city/postal filter to obtain the provider branch ID and check `sells_online`/`pickup_type: STORE`. Store Details must still resolve the Google ID in the selected country. Street/city/full postal matching is intentionally conservative; abbreviations/format differences may remain unavailable until reviewed. No Google search response or location is retained by this mechanism.

For US, use `providerId: "reef-kroger"`, `country: "US"`, `channel: "in-store"`, omit `banner`, and use the exact returned `store.banner_name` for `retailer`. Obtain the provider's actual location ID/address; do not infer it from Google's ID or chain name.

### Reviewed product configuration

`SHOPMATE_PRICING_PRODUCTS` is a JSON array. Each mapping identifies one ingredient/package for a provider and retailer. SKU/GTIN identifiers, exact normalized name/brand, fixed package net content, preparation and usable content must all agree. A SKU ID match never overrides a changed size/name/brand. Name/brand/size fallback without an ID is allowed only for one unambiguous result. Example **template**, not verified data:

```json
[
  {
    "providerId": "reef-loblaws",
    "retailer": "No Frills",
    "ingredientId": "rice",
    "productId": "REPLACE_WITH_REVIEWED_PRODUCT_ID",
    "expectedName": "REPLACE WITH EXACT PRODUCT NAME",
    "expectedBrand": "REPLACE WITH EXACT BRAND",
    "netQuantity": { "quantity": 900, "unit": "g" },
    "usableQuantity": { "quantity": 900, "unit": "g" },
    "preparation": "dry",
    "contentEvidenceUrl": "https://example.org/replace-with-real-product-evidence"
  }
]
```

Optional `gtin` must have a valid GS1 check digit (8/12/13/14 digits). Do not pad Kroger's internal 13-digit product ID into a guessed barcode; use its checked `gtin14` field. `preparation` is `dry|drained|edible|raw|as-sold`. Canned chickpeas need reviewed **drained** grams; oils/juice use ml, never implicit density. Variable-weight produce, ambiguous packs, unknown brands, changed formulations and stock unknown/out-of-stock are rejected. US oz/lb and US volume units normalize within their dimension. Multiple package sizes per ingredient are allowed, subject to the existing exact covering-search precision guard.

For `.env.local`, put each JSON array on one line in single quotes, e.g. `SHOPMATE_PRICING_STORES='[{...}]'`. Actual schema is in `src/server/pricing/retail-config.ts`; placeholders intentionally do not establish live coverage. No production branch mappings or sample prices are shipped for live mode. User-entered price editing is not implemented.

## Eligibility, caching and limits

- Server-only secrets; fixed API hosts; sanitized envelopes; no upstream payload/secret URLs returned. All client requests use strict shared schemas; prices and mappings are never accepted from the browser.
- Integer CAD/USD cents; country/currency and channels never mixed. Effective prices require branch scope, fixed size, available stock, fresh source observation and an exact reviewed product match.
- Loblaws was-prices are historical. An unknown-expiry sale cannot fall back to its higher historical price as if it were currently purchasable. Dated unconditional sales can be used; loyalty/coupon/multi-buy eligibility is not assumed. Kroger sales are retained as conditional metadata; only its regular price is used.
- Five-minute maximum process-local Reef cache, at most 200 entries, scoped by credential hash/provider/branch/channel/query, with in-flight deduplication. Cache hits preserve original retrieval time. Provider `fetched_at` bounds age separately from retrieval; it is **not** a retailer update timestamp. A provider cache hit without its original time is rejected. Known promotion expiry shortens the usable lifetime. All branch offers are rechecked after fetching; complete baskets are checked again after optimization.
- Eight-second outbound request deadlines, one retry only for network/502/503/504 (150 ms delay), no retries on authentication/quota errors. Process-local guard: 60 outbound calls/minute, 500/day, 4 concurrent. Caches/guards are not distributed; configure deployment-wide/provider hard caps before public use.
- Each pricing run starts at most 64 reviewed SKU lookups/store, at most three stores; later/unqueried ingredients remain missing. Official Kroger uses exact product details for configured IDs; query results are deduplicated within the run. A 20-second overall start deadline bounds new pricing calls; an active bounded request/retry can finish afterward. Fresh quotes survive a later SKU failure. Discovery verifies branch capability within a separate 20-second start budget. Routes allow 60 seconds including Google ID resolution.
- Official Kroger product/location responses are not retained in a cross-request cache. OAuth tokens are server-only, credential-scoped and refreshed before their returned expiry. Five-minute application quote validity is not a checkout or retailer-update guarantee. Regular fixed-package in-store prices only; stock and fulfillment evidence must be explicit. Unknown/conditional sale prices never replace regular prices. No browser or customer token is used.
- Partial provider failures coexist with usable quotes. A store with missing ingredients has no comparable basket total. No successful query due to credentials/quota/provider failure returns 503/429/502 respectively; unsupported/no matching products are domain unavailability. Never use incomplete subtotals as savings.
- Bidou RSS: two region caches, five minutes, in-flight deduplication, eight-second deadline, 256 KiB/50-item parser limit, no DTD/entities. Observation dates and unknown expiry/stock remain visible. It does not inherit the branch-pricing basis.

## Verification

`npm run verify` runs offline/synthetic provider tests, production build and real local HTTP smoke requests; it clears provider keys in the smoke child process to avoid charges. New tests cover exact identity/address, barcode validation, package conversions, currencies, promotions/expiry, historical-price traps, missing oil, partial failures, retries/cache timestamps, capped search and two-store v2 route composition. No production response fixture or credential is committed.

Opt-in network checks (consume quota where keys are present):

```powershell
$env:SHOPMATE_LIVE_SMOKE='1'
npx vitest run tests/pricing-live.test.ts
npx vitest run tests/backend-live.test.ts
npx vitest run tests/pricing-official-live.test.ts
```

Set credentials/configuration in the shell for Vitest; it does not automatically load `.env.local`. Do not paste credentials in chat. The public Ontario Bidou test was run successfully. Credentialed Reef/Google/official Kroger tests remain skipped until access is configured. The frontend must explicitly adopt v2 to use real pricing; it was not changed in this backend task.
