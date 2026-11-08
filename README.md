# ShopMate

**Eat better. Spend smarter.** A grocery comparison and meal planning MVP for UB Hacking 2026.

This repository is the **shared foundation**, ready for independent frontend, store-discovery, and optimization worktrees. Start by choosing a country, then enter a validated postal or ZIP code to open the explicitly labeled demo stores. Recipes are available in a collapsed library. Shared contracts, API scaffolds, provider interfaces, and the curated catalog support later implementation. It does not yet search Google or optimize meals; demo stores do not use or retain the entered postal code.

The November 7 recovery review is saved in [PLAN.md](PLAN.md): audited working/mocked/missing features, external access requirements, and a scoped hackathon delivery plan. [docs/API.md](docs/API.md) preserves the current v1 contract and separately proposes v2 for verified branch/product prices. V2 is documentation only; no application behavior changed. Parallel work/worktrees still require explicit user authorization.

## Run locally

Use Node.js 24 LTS (the tested version is 24.15.0) and npm. Node 22.12+ on the 22.x line is also supported by the tooling.

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The demo at [localhost:3000/demo](http://localhost:3000/demo) requires no environment variables. Stop the dev server with Ctrl+C before a production verification run.

The visual planner includes animated household figures, a budget slider with exact entry, illustrated food preferences and meal selectors. Real retailer cards optionally load banner-specific Brandfetch logos. Set `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` to your own public Logo API client ID and restart/rebuild; without it, local initials appear. Demo stores keep fictional icons. See [logo setup, service terms and verification](docs/RETAILER-LOGOS.md).

Optional configuration, for the future live-discovery implementation:

```powershell
Copy-Item .env.example .env.local
```

Set `GOOGLE_MAPS_API_KEY` in `.env.local` only when implementing live discovery. The current foundation never calls Google, even if a key is set. Keep the key server-side; `.env.local` is ignored by Git.

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
  app/                    App Router shell, read-only demo, and API routes
    api/{health,stores,optimize}/
  components/             Shared brand, shell, original SVG art, recipe card
  contracts/              Shared domain types, requests/results, Zod schemas
  data/                   14 recipes, 31 ingredients/packages, illustrative prices
  lib/                    Small browser-safe utilities
  server/
    discovery/            StoreDiscoveryProvider and explicit demo implementation
    pricing/              GroceryPricingProvider and illustrative implementation
    optimization/         OptimizationEngine interface; implementation pending
tests/                    Contract, catalog, provider, and route regression tests
scripts/                  Production HTTP smoke checks
docs/                     API, worktree, and deployment handoffs
```

## Current API behavior

- `GET /api/health`: `200`, reports which features are implemented.
- `POST /api/stores`: `200` in explicit `demo` mode; `501 not-implemented` for `live`.
- `POST /api/optimize`: validates input, then `501 not-implemented` in either mode.
- Invalid JSON returns `400`; schema-invalid requests return `422` with field paths.

There is no silent live-to-demo fallback. All package prices are **illustrative samples**, including profiles named after real grocery chains. Demo store names/addresses are fictional; no real nearby distances are supplied. Nutrition is estimated. There is no authentication, payment system, database or LLM. Retailer logos are an optional external image integration; setup illustrations are original local SVGs.

## Development handoff

Read [PLAN.md](PLAN.md), [AGENTS.md](AGENTS.md), [API contracts](docs/API.md), and [data assumptions](src/data/README.md) before editing. [WORKTREES.md](docs/WORKTREES.md) has exact PowerShell commands for the three workstreams and their development ports. [DEPLOYMENT.md](docs/DEPLOYMENT.md) covers Vercel preparation; nothing has been deployed.
