# ShopMate frontend — market design

The homepage now introduces ShopMate with an original grocery-tote illustration, bold local typography, a concise three-step guide, and clear links into the planner. `/plan` runs the existing live journey; `/demo` remains a separate, explicitly illustrative experience. Pages remain Server Components and pass the existing catalog to the interactive planner.

## Visual identity

- Warm cream, forest, sage, apricot and butter colours; generous desktop spacing and a compact mobile flow.
- Original inline SVG groceries, food illustrations and line icons in `grocery-art.tsx`. No external artwork, stock photos, image requests or animation dependencies.
- The reference at https://dh26.dubhacks.co/ was inspected for its bold typography, integrated illustration and playful interactions. Its artwork, branding, code and layouts were not reused.
- Reusable market labels, paper details, rounded selection cards, clear progress, illustrated loading/empty states and a shopping-list completion bar.
- Local DM Sans and its existing OFL license are retained. Replaced photographs and their credit UI are removed; the old `/credits` URL redirects home.
- Hover, selection and gentle SVG animations respect reduced-motion preferences. Forms retain visible focus, labels, validation, keyboard submission and live status feedback.

## Preserved integrations and truth rules

Backend routes, providers, contracts, catalog, root configuration, dependencies and lockfile are unchanged. The existing v2 discovery, pricing preflight and optimization requests retain their validation, cancellation and dependent-state clearing.

Fictional stores, illustrative prices and estimated nutrition remain visible beside relevant content. Unavailable pricing never becomes a comparable zero-cost basket. Complete baskets, package quantities, currency, budget balances and nutrition come from existing server responses. Capped and exhausted searches retain distinct results. Multiple stores compare whole baskets; purchases are not split.

The official `public/google-maps-logo.svg` and provider attribution rendering are retained. Price provenance, quote channel, retrieval/expiry, exclusions and safe source links remain in live results. A failed live search offers a separate sample link rather than switching modes.

## Verification

Frontend regression tests in `tests/frontend-design.test.ts` render actual CA/US demo route responses and check illustrative/estimated labels, explicit currencies and original artwork. They also cover capped-search copy and unavailable pricing without an invented total. Existing journey and v2 integration tests remain intact.

Browser checks include desktop and mobile layouts, postal/ZIP and budget validation, explicit sample entry, multiple stores, preferences/exclusions, review/back navigation, actual generated demo meals, recipe details, comparisons, checked groceries, copied lists, alternate-store lists, estimated nutrition and an unaffordable-budget result.

Live Google discovery and verified retailer success require provider credentials and reviewed coverage. Browser QA observes the real unconfigured-search state; it does not claim a credentialed live run. Printing is available but no physical print job is sent. No formal accessibility audit is claimed.

Final checks (November 7, 2026): `npm run lint`, `npm run typecheck` and `npm test` passed: 16 test files / 255 tests, with 2 credential-gated files / 4 tests skipped. The default `npm run verify` reached a Turbopack CSS-worker failure, reproduced outside the Windows sandbox. `npm run build -- --webpack` passed using Next.js's documented bundler option; no build configuration was changed. `npm run test:smoke` passed all 27 production HTTP requests. The smoke script changes cover only the redesigned homepage, `/plan` entry and brand-style assertions; API checks are retained.

The resulting production build was inspected at 1280 × 900, 768 × 1024, 390 × 844 and 320 × 800. Inspected views had no horizontal overflow. The production CA sample journey retained budget/diet/meal choices through back navigation, completed a real demo optimization, and displayed whole-basket comparisons and keyboard-operated grocery progress. Earlier US development-browser checks covered the full journey, recipe details, copied lists, alternate stores, nutrition and low-budget results. The production browser reported no warnings or errors. Desktop/mobile captures were saved outside Git in the chat's visualization directory; temporary viewport overrides were cleared.
