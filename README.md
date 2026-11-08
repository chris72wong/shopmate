# ShopMate

**Eat better. Spend smarter.** A grocery comparison and meal planning MVP for UB Hacking 2026.

ShopMate discovers eligible major grocery chains in Canada and the US, automatically selects the three closest returned banners, and plans meals with whole-package costs, dietary constraints, recipes and shopping lists. The illustrated planner supports both single-store comparisons and complete purchases split across selected stores. The explicit demo works without credentials using fictional stores and illustrative prices.

The historical recovery review is saved in [PLAN.md](PLAN.md). [docs/API.md](docs/API.md) documents the implemented v1 and v2 routes; [docs/INTEGRATION.md](docs/INTEGRATION.md) records local merges and verification. Live pricing requires authorized retailer access and reviewed ingredient/package mappings. Unsupported stores and missing prices remain unavailable; successful discovery does not establish price coverage.

## Run locally

Use Node.js 24 LTS (the tested version is 24.15.0) and npm. Node 22.12+ on the 22.x line is also supported by the tooling.

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The demo at [localhost:3000/demo](http://localhost:3000/demo) requires no environment variables. Stop the dev server with Ctrl+C before a production verification run.

The visual planner includes animated household figures, a budget slider with exact entry, illustrated food preferences and meal selectors. Real retailer cards optionally load banner-specific Brandfetch logos. Set `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` to your own public Logo API client ID and restart/rebuild; without it, local initials appear. Demo stores keep fictional icons. See [logo setup, service terms and verification](docs/RETAILER-LOGOS.md).

For live configuration, create `.env.local` only if it does not already exist:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Set server-only `GOOGLE_MAPS_API_KEY` for live Geocoding and Places API (New). For official US Kroger pricing, set `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` and reviewed `SHOPMATE_PRICING_PRODUCTS`; exact branch matching or reviewed bindings are required. Reef adapters additionally require `REEF_KEY` and reviewed `SHOPMATE_PRICING_STORES`. See [pricing setup](docs/PRICING.md). Keep credentials server-side; `.env.local` is ignored by Git.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server, normally port 3000 |
| `npm run dev -- --port 3001` | Use a different port in a parallel worktree |
| `npm run lint` | ESLint, with no warnings allowed |
| `npm run typecheck` | Strict TypeScript validation |
| `npm test` | Vitest contracts, catalog integrity, providers, and route handlers |
| `npm run test:watch` | Watch unit/contract tests |
| `npm run build` | Production Next.js build |
| `npm start` | Serve the production build |
| `npm run test:smoke` | Start a temporary production server and check actual HTTP responses; requires a build |
| `npm run verify` | Lint, types, tests, build, then production HTTP smoke checks |

The smoke script allocates an available loopback port and stops its own server. `.next/` is mutable build state: do not run `next dev` and `next build` simultaneously in the same checkout. Each worktree has its own dependencies, environment, and build state.

## Structure

```text
src/
  app/                    App Router shell, live/demo planner, and API routes
    api/                  V1 and additive v2 discovery/pricing/planning
  components/             Illustrated controls, store cards, recipes and lists
  contracts/              Shared domain types, requests/results, Zod schemas
  data/                   14 recipes, 31 ingredients/packages, illustrative prices
  lib/                    Small browser-safe utilities
  server/
    discovery/            Google major-grocer discovery and explicit demo
    pricing/              Official Kroger/Reef adapters, packages and provenance
    optimization/         Deterministic single/mixed-store package optimization
tests/                    Contract, catalog, provider, and route regression tests
scripts/                  Production HTTP smoke checks
docs/                     API, worktree, and deployment handoffs
```

## Current API behavior

- `GET /api/health`: `200`, reports which features are implemented.
- `POST /api/stores`: fictional demo stores or live Google discovery; no live prices in v1.
- `POST /api/optimize`: illustrative demo planning; live requests must use v2.
- `/api/v2/stores`, `/pricing`, `/optimize`: automatic selection, current verified offers or explicit unavailability, complete single/mixed-store plans.
- `/api/v2/plan`: optional one-call discovery, selection and planning; the browser keeps separate steps for reviewing stores and preferences.
- Invalid JSON returns `400`; schema-invalid requests return `422` with field paths.

There is no silent live-to-demo fallback. Sample price profiles, including those named after real chains, remain **illustrative**. Verified prices require fresh, branch-scoped offers and reviewed package content; incomplete baskets have no comparable total. Demo stores are fictional with no nearby distances. Nutrition is estimated. There is no authentication, payment system, database or LLM. Retailer logos are an optional external image integration; setup illustrations are original local SVGs.

## Development handoff

Read [PLAN.md](PLAN.md), [AGENTS.md](AGENTS.md), [API contracts](docs/API.md), and [data assumptions](src/data/README.md) before editing. [WORKTREES.md](docs/WORKTREES.md) has exact PowerShell commands for the three workstreams and their development ports. [DEPLOYMENT.md](docs/DEPLOYMENT.md) covers Vercel preparation; nothing has been deployed.
