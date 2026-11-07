# Curated sample catalog

This is a small project-authored fixture catalog, not a retailer feed, a scraped dataset, or a verified nutrition database. All prices are **illustrative**, and all nutrition values are **estimates**. The data is intended for deterministic MVP calculations and tests.

## Contents

- `ingredients.ts`: 31 ingredients with stable IDs, categories, canonical units, dietary/allergen metadata, and estimated nutrition per stated basis quantity.
- `recipes.ts`: 14 curated, two-serving recipes with explicit ingredients, amounts, preparation steps, estimated total time, and local illustration variants. Dietary/allergen labels and per-serving nutrition are derived from the structured ingredients at load time, not from an LLM call.
- `pricing.ts`: one generic product package per ingredient, available in both countries, plus 12 price profiles and 372 explicit illustrative offers (31 packages × 12 profiles).
- `demo-stores.ts`: three fictional stores for each country. No place IDs, real coordinates, map links, or nearby distances.

## Units, preparation state, and package math

- `g` means grams; `ml` means milliliters; `each` is a count. Never implicitly convert between these units.
- Recipe ingredient amounts cover the full declared yield, not one serving. Scale by requested servings divided by recipe yield.
- Rice, pasta, oats, quinoa, and red lentils are measured **dry**. Water added during cooking is free and contributes no nutrition in this fixture.
- Canned chickpeas/black beans are **drained**: a fixture can labeled 400 g has 240 g usable content. Corn's can label is 341 ml, but its usable drained content is 285 g. Only usable content enters package math.
- Banana quantities represent edible flesh. Produce package weights use explicit usable-portion assumptions. They are illustrative packaged units rather than actual variable-weight checkout prices.
- Olive oil, milk, lemon juice, and soy sauce use ml. Their nutrition values are per 100 ml estimates, not values silently converted from 100 g.
- Eggs and tortillas use each, with nutrition per one item. The fixture package counts are integers. Scaled recipe requirements can be fractional; purchased package counts are always whole.
- Every ingredient except water has a priced package. No free pantry assumption, optional garnish, or unpriced seasoning is hidden in the recipes.
- Aggregate across all meals **before** rounding to packages. For example, two recipes needing 120 g drained chickpeas each need one 240 g usable can together. Buying each recipe independently would use two cans.
- Nutrition arithmetic uses the requested recipe ingredient quantities, not the entire packages purchased or leftover contents. Per-serving display values are rounded to one decimal.

## Pricing profiles

Named sample chain profiles are Loblaws/No Frills/Walmart Canada in CAD and ALDI/Kroger/Walmart US in USD. Names support future discovery matching; the values are not observed, branch-specific, historical, endorsed, or live retailer prices.

Fictional Cedar/Clover/Orchard profiles are separate identities. They reuse the three country-specific price columns as fixtures. A fictional store never claims membership in a real chain. CAD/USD columns are independent examples, not exchange-rate conversions. Profiles may show different relative totals depending on the basket; no store is hardcoded as the optimizer winner.

Prices exclude tax, fees, delivery, discounts, loyalty programs, deposit charges, travel, and stock changes. `available: true` represents fixture availability only. Unknown products must remain missing. Stores without a supported matching profile have unavailable pricing; never substitute another store's price silently.

## Dietary and nutrition assumptions

Ingredients declare which supported diets they satisfy. Recipes receive a dietary tag only if every ingredient has it. Vegan ingredients also have vegetarian tags. Milk, yogurt, cheddar, and eggs are vegetarian in this simplified fixture. Animal-derived rennet, brand variation, manufacturing processes, and cross-contact are not modeled.

Oats are specifically **certified gluten-free** fixture products. Wheat pasta, wheat tortillas, and wheat-containing soy sauce are not gluten-free. Tofu and soy sauce declare soy; peanut butter declares peanuts; dairy declares milk; eggs declare egg. The complete exclusion vocabulary also includes fish, shellfish, tree nuts, and sesame even when the initial recipes do not use them.

Nutrition estimates are authored for the sample catalog; they have not been verified against USDA, Health Canada, laboratory analysis, or branded package labels. Do not present them as exact values or dietary advice. Replace them with traceable product/food composition data before relying on nutrition accuracy outside this demo. Users must check actual product labels for allergens.

## Adding or replacing data

Preserve stable IDs when meaning/units are unchanged. Introduce a new ID for a different ingredient/preparation state. Add compatible packages and offers for required countries/profiles, or intentionally leave pricing unavailable and test it. Keep `basis: "illustrative"` until a real provider contract explicitly supports live or observed prices with provenance.

Run catalog tests after edits. They check unique IDs, references, ingredient units, recipe yields/quantities, label consistency, nutrition consistency, country currencies, integer positive prices, and complete seed profile coverage. They do not certify real-world price/nutrition accuracy.
