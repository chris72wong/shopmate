# ShopMate agent instructions

## Scope and source of truth

- Read `PLAN.md`, `docs/API.md`, and `src/data/README.md` before implementation.
- This is a Next.js App Router, TypeScript, Tailwind, and Zod project. Keep it hackathon-friendly.
- The initial milestone is a foundation, not the complete MVP. Live Google discovery, selection/preferences forms, and the optimizer are intentionally pending.
- User instructions take precedence. Do not create worktrees or spawn/delegate to agents unless the user explicitly authorizes that step. The foundation request does not authorize either.
- `src/contracts/` and `docs/API.md` are the shared integration contract. Preserve field names, IDs, units, error envelopes, and discriminated unions.

## Ownership during parallel development

| Workstream | Owns | Avoid editing independently |
| --- | --- | --- |
| A: frontend | `src/components/`, UI files in `src/app/` (excluding `api/`), UI-specific `src/lib/` utilities, UI tests | Providers, catalog, API route handlers, shared contracts |
| B: store discovery | `src/server/discovery/`, `src/app/api/stores/`, discovery tests | Optimization, pricing, visual components |
| C: optimization | `src/server/optimization/`, `src/server/pricing/`, `src/app/api/optimize/`, optimizer/pricing tests; additive catalog changes as needed | Discovery implementation, visual components |
| Main: integration | Contracts, root configuration/dependencies/lockfile, shared docs, CI, smoke script, composition across workstreams | Uncoordinated edits in active agent-owned files |

- One branch and checkout per workstream. Never switch a different agent's branch, modify their worktree, or share `node_modules/` or `.next/` between worktrees.
- Work only within the assigned scope. If a shared change is necessary, describe it to the main agent and coordinate one contract update before depending on it.
- Use additive, narrowly named test files such as `tests/discovery-google.test.ts` and `tests/optimization-engine.test.ts`. Coordinate edits to existing shared tests.
- Only main changes `package.json`, `package-lock.json`, root configs, `src/contracts/`, or API contract docs unless explicitly assigned.
- Never commit conflict markers, build output, temporary screenshots, `.env.local`, credentials, or Google response fixtures copied from production.
- Commit small coherent changes; include implementation, meaningful tests, and documentation for changed behavior. Report commands actually run and any limits.
- Do not use `git reset --hard`, force-push, delete branches/worktrees, or overwrite unrelated work to resolve a conflict. Ask the main integrator to coordinate conflicts.

## Code standards

- Use strict TypeScript and `@/` imports. No `any`, `@ts-ignore`, or disabling checks to hide errors.
- Keep components server-rendered by default. Add `"use client"` only where interaction requires it.
- Mark implementations that access secrets, providers, or server data with `import "server-only"`. Provider interface files may use type-only imports in shared code.
- Validate external input with the shared Zod schemas at route boundaries. Perform business validation (known IDs, country, pricing coverage) server-side as well.
- Use the `ApiResponse<T>` success/error envelope and HTTP helpers; never return raw exceptions, upstream key-bearing URLs, or API keys to the browser.
- Money is integer cents with explicit currency. Budget and selected country must agree. Do not convert or compare CAD and USD.
- Quantities use `g`, `ml`, or `each`. Preserve dry/drained/edible semantics. Never assume 1 ml equals 1 g.
- All required ingredients except water must be priced; do not quietly treat oil or pantry ingredients as free.
- Keep deterministic calculations outside React and route handlers. Stable ordering and tie-breaking are required. Do not call an LLM for prices, nutrition, or optimization.
- Avoid new dependencies unless a concrete need warrants them. Use the existing npm lockfile; do not introduce another package manager.

## Data integrity and product honesty

- Never fabricate real nearby stores, addresses, coordinates, distances, or Google attributions. Demo stores must remain explicitly fictional and separate from live results.
- `mode` is explicit; a failed or unconfigured live request must not become a successful demo request.
- All current pricing is `illustrative`. Matching a real store to a supported chain does not make its sample prices live or branch-specific.
- Unmatched stores must have unavailable pricing. Missing offers make a basket incomplete; do not display an incomplete subtotal as a comparable basket total.
- Dietary restrictions and exclusions are hard constraints. “High protein” is a soft priority unless a future contract explicitly adds a threshold.
- Nutrition and allergen labels are sample estimates/metadata, not a guarantee about brands, substitutions, or cross-contact.
- Do not claim global optimality or infeasibility after a truncated search. Use the contract's search/optimality/incomplete fields.

## Google integration requirements (Agent B)

- Use server-side Geocoding and Places API (New) with `GOOGLE_MAPS_API_KEY`; never use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Restrict geocoding to the supplied country; validate country from results. Implement explicit field masks, bounded radius/results, request deadlines, quota/error handling, and conservative chain matching.
- Return required attribution metadata. Before exposing live results without a map, implement the official Google Maps logo and any applicable third-party attributions. Do not replace the logo with plain text.
- Follow current Google content retention/caching requirements; avoid persisting search responses or logging postal codes, precise locations, and provider payloads.
- Public Terms and Privacy pages and key restrictions/quota controls are live-launch requirements, not completed foundation features. See `docs/DEPLOYMENT.md`.

## UI standards

- Preserve the cream, forest, sage, apricot, and charcoal theme in `src/app/globals.css`.
- Favor clear consumer language, generous whitespace, original imagery, responsive cards, and a simple five-step journey. Do not expose developer/architecture details in product flows.
- Use semantic headings, explicit form labels, keyboard-accessible controls, visible focus, useful error/loading/empty states, and reduced-motion behavior.
- Keep illustrative pricing, fictional-store, and estimated-nutrition labels visible near the relevant content.

## Verification and handoff

- Run `npm run lint`, `npm run typecheck`, and `npm test` for relevant changes. Run `npm run build` for route, configuration, dependency, or UI changes.
- Main runs `npm run verify` after integration, plus desktop/mobile browser checks when a browser is available.
- Prioritize tests for country/postal validation, data references, packages/rounding, budgets, exclusions, missing pricing, and no-feasible/incomplete behavior. Do not add snapshots that merely duplicate implementation details.
- Stop a checkout's dev server before building; both use `.next/`. Use the documented independent worktree ports.
- Never report a check as passing unless it ran successfully. Mention unimplemented features and remaining verification limits in the handoff.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
