# ShopMate

**Good food. Less fuss.** AI meal ideas turned into a practical grocery list for UB Hacking 2026.

ShopMate uses **Gemini 3.5 Flash-Lite** to generate original, structured meals for your household and dietary preferences. It combines shared ingredients with deterministic quantity arithmetic, lets you swap individual meals, tracks what you already have, and exports a consolidated grocery list with genuine Canadian or US retailer search links. Optional Google Maps discovery finds actual nearby grocers.

For the hackathon walkthrough and verification limits, read [DEMO_GUIDE.md](DEMO_GUIDE.md). [PRODUCT_DECISION.md](PRODUCT_DECISION.md) explains the focused product and [AGENT_HANDOFF.md](AGENT_HANDOFF.md) records actual checks and branch handoff.

The historical recovery review is saved in [PLAN.md](PLAN.md). [docs/API.md](docs/API.md) documents the implemented v1 and v2 routes; [docs/INTEGRATION.md](docs/INTEGRATION.md) records local merges and verification. Live pricing requires authorized retailer access and reviewed ingredient/package mappings. Unsupported stores and missing prices remain unavailable; successful discovery does not establish price coverage.

## Run locally

Use Node.js 24 LTS (the tested version is 24.15.0) and npm. Node 22.12+ on the 22.x line is also supported by the tooling.

```powershell
npm ci
npm run dev
```

Set server-only `GEMINI_API_KEY` in `.env.local`, then open [localhost:3000](http://localhost:3000). The primary planner is `/plan`. Stop the dev server with Ctrl+C before production verification. Missing or rejected credentials produce an explicit error; there is no sample fallback.

The planner includes a household slider with animated figures, a CAD/USD budget-guidance slider, dietary choices, single-meal swaps, a checkable list and copy/download. Budget guides recipe ideas; actual prices, product matches, stock, checkout carts and delivery are unavailable. Food visuals are original illustrations, not recipe photographs. Share-A-Cart requires an unavailable application credential; see [the brief investigation](docs/SHARE_A_CART.md).

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

- `POST /api/meals`: live structured Gemini recipes, validated against household and dietary preferences. No price claims or sample fallback.
- `GET /api/health`: `200`, reports which features are implemented.
- `POST /api/stores`: fictional demo stores or live Google discovery; no live prices in v1.
- `POST /api/optimize`: illustrative demo planning; live requests must use v2.
- `/api/v2/stores`, `/pricing`, `/optimize`: automatic selection, current verified offers or explicit unavailability, complete single/mixed-store plans.
- `/api/v2/plan`: optional one-call discovery, selection and planning; the browser keeps separate steps for reviewing stores and preferences.
- Invalid JSON returns `400`; schema-invalid requests return `422` with field paths.

The legacy `/demo` and optimizer endpoints remain separately labeled sample functionality. They are not used by the primary meal-to-grocery flow. There is no silent live-to-demo fallback. Legacy prices remain **illustrative** unless backed by actual verified offers; demo stores remain fictional. The primary workflow invents no retailer facts and provides no checkout integration. There is no authentication, payment system or database. Setup and meal visuals are original local SVG illustrations.

## Development handoff

Read [PLAN.md](PLAN.md), [AGENTS.md](AGENTS.md), [API contracts](docs/API.md), and [data assumptions](src/data/README.md) before editing. [WORKTREES.md](docs/WORKTREES.md) has exact PowerShell commands for the three workstreams and their development ports. [DEPLOYMENT.md](docs/DEPLOYMENT.md) covers Vercel preparation; nothing has been deployed.
