# Retailer logos and visual setup

Store cards identify Canadian and American grocery banners using an explicit official-domain allowlist in `src/lib/retailer-brands.ts`. It reuses the existing pure discovery name matcher; no discovery, pricing, contracts or optimizer behavior changes. Logo identity does not establish pricing coverage, branch verification or retailer affiliation.

## Logo setup

1. Get your own public Logo API client ID from the [Brandfetch developer portal](https://developers.brandfetch.com/). No paid Brand API key is required.
2. Set `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` in `.env.local` (or the build environment). This ID is intentionally public. Never put Google, Reef or secret Brand API keys in it.
3. Restart development or rebuild production; Next.js inlines public environment variables at build time.

Without an ID, no CDN requests are made. Unknown retailers, missing images, blocked requests and CDN errors keep a local initial badge. Fictional demo stores always use ShopMate's original grocery icons, even when their names resemble retailers. The logo box reserves space during loading, and `object-fit: contain` preserves the mark's aspect ratio without cropping, tinting or recoloring it.

The same banner resolves to the same CDN URL across branches, including possessive No Frills names and the supported Publix / ShopRite branch formats. Related banners remain separate: Loblaws, No Frills, Real Canadian Superstore, Atlantic Superstore, Maxi and the other Loblaw banners each use their own sites. The US Kroger and Albertsons banners also use their own domains. Walmart and Safeway resolve to their respective Canadian / US sites.

Discovery's broad Giant and Martin's groups cover unrelated regional businesses. Explicit `Giant Food`, `Giant Food Stores`, `Martin's Food Markets` and `Martin's Super Markets` names get their respective sites; ambiguous bare names retain initials. Albertsons Market and Market District retain their distinct sites as well. This is display matching only; it never changes server chain IDs or prices.

## Service and trademark requirements

Reviewed November 7, 2026 against Brandfetch's [Logo API guidelines](https://docs.brandfetch.com/logo-api/overview), [parameters](https://docs.brandfetch.com/logo-api/parameters), [terms](https://brandfetch.com/terms) and [fair-use guide](https://docs.brandfetch.com/guides/logo-fair-use).

- Images are direct browser `<img>` hotlinks to the Brandfetch CDN with the application's public client ID. There is no Next.js image proxy, download, persisted copy, server fetch, SDK or logo API route.
- `referrerPolicy="strict-origin"` supplies the origin required by Brandfetch, without sending the page path, search parameters, postal code or branch information. The CDN URL contains only an allowlisted retailer domain and the public client ID.
- `fallback/404` lets ShopMate render its own fallback instead of accidentally displaying a service logo. Failed images do not repeatedly retry or block store selection.
- Logos identify the retailer in the listing. They are not edited, used as ShopMate branding, or presented as an endorsement. The store list includes an ownership / no-affiliation note and a Brandfetch link when configured. Trademark rights remain with their respective owners; the logo service does not confer retailer licensing or display rights beyond applicable identification use. Review applicable retailer brand rules before public launch.
- No Places photos or photo credits are requested or displayed. The existing official Google Maps logo, required discovery attributions and Maps links remain independent of retailer branding.
- Respect the service's current limits and terms. Recheck them when launching; never reuse someone else's example client ID.

Domain references include the [official Loblaw banner directory](https://www.loblaw.ca/en/our-business/), [Sobeys](https://corporate.sobeys.com/), [Kroger divisions](https://www.thekrogerco.com/contact-us/our-divisions/), individual banner homepages (the allowlist stores their domains), and the distinct [Giant Food](https://giantfood.com/), [GIANT](https://giantfoodstores.com/), [MARTIN'S](https://martinsfoods.com/) and [Martin's Super Markets](https://martinsgroceriestogo.com/) sites. Keep this mapping curated; do not derive a domain from an arbitrary store name or Google URL.

## Visual setup behavior

- Household: 1–8 people appear and disappear as a native radio selector changes. Arrow keys work within the group.
- Budget: primary dollar slider plus exact decimal entry; cents and CA/US currency validation remain unchanged. The slider expands for exact budgets above $300, up to the existing $10,000 contract limit.
- Food: illustrated cards for the three supported diets, nine hard allergen exclusions and the existing soft high-protein preference. No unsupported diets are offered.
- Meals: 1–14 illustrated meal slots and three visual priority cards retain their exact backend values. Choices survive back navigation and invalidate previous plans.
- Native controls, explicit names, visible focus, pressed / checked states and the existing global reduced-motion rule cover keyboard, screen reader and motion preferences. Animations are short selection feedback, with no new continuously moving setup artwork.

## Verification

`npm run verify` passed: lint, strict TypeScript, 591 passing tests (4 opt-in live-service tests skipped), production build and 27 production HTTP smoke requests. The build was run with the required filesystem permissions after a restricted Windows worker could not create a generated prerender directory. `git diff --check` passed.

`tests/frontend-retailer-logos.test.ts` covers banner separation, countries, branch consistency, ambiguous names, fictional identities, allowlisted URLs, absent configuration and pricing honesty. `tests/frontend-visual-preferences.test.ts` covers the supported options, accessible states, household / meal bounds and exact budget rendering. `tests/frontend-visual-interactions.test.ts` uses jsdom (development only) to drive the complete CA/US demo journey against the actual local route handlers, verify submitted preferences and back navigation, reject invalid budgets, deselect restrictions, and simulate logo loading/failure. No runtime dependencies were added.

Desktop/mobile screenshot review could not run in this session: the in-app browser timed out on localhost, then Computer Use stopped because it could not verify the local Chrome URL. Live CDN image delivery also requires the owner's Brandfetch client ID. Neither limitation is treated as a passing browser or credentialed logo check.
