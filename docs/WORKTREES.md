# Parallel development worktrees

The foundation task creates no worktrees or feature branches. After reviewing the committed foundation, use these exact PowerShell commands from this repository. Paths below match the current Windows workspace; sibling directories must not already be in use.

## Create the three independent checkouts

```powershell
Set-Location "C:\Users\myste\Desktop\shopmate"
git status --short
git branch --show-current
# Confirm main is clean before creating branches from it.

git worktree add -b feat/frontend "..\shopmate-frontend" main
git worktree add -b feat/store-discovery "..\shopmate-store-discovery" main
git worktree add -b feat/optimization "..\shopmate-optimization" main
git worktree list

npm --prefix "..\shopmate-frontend" ci
npm --prefix "..\shopmate-store-discovery" ci
npm --prefix "..\shopmate-optimization" ci
```

The frontend worktree is Agent A. The two backend worktrees are Agent B (store discovery) and Agent C (optimization). Open each folder as the working directory of its own Codex chat and give it the corresponding task below. Do not run all agents in the same checkout. These are commands for you to run after review, not worktrees created by the foundation.

## Suggested agent task briefs

**Agent A:** Read `AGENTS.md`, `PLAN.md`, and `docs/API.md`. Implement the responsive five-step frontend in UI-owned files using shared contracts and JSON APIs. Preserve current branding and truthful demo/price/nutrition labels. Include loading/error/empty/infeasible/incomplete states. Coordinate contract or dependency changes with main. Do not implement providers/optimizer or edit backend routes.

**Agent B:** Read the same docs plus `src/data/README.md`. Implement server-side Google Geocoding and Places API (New), country/postal validation, conservative chain matching, live store resolution, distances, attribution metadata, sanitized errors, and tests in discovery-owned files. Preserve explicit demo mode and never fall back silently. Do not implement optimizer/pricing/UI. Coordinate public attribution/policy rendering with main/A.

**Agent C:** Read the same docs plus data assumptions. Implement the deterministic optimizer, scaled ingredient aggregation, full package purchase costs, same-basket store comparisons, hard constraints/budget, objective scoring, reuse/savings calculations, and feasible/infeasible/incomplete results. Start with working demo optimization and meaningful exact arithmetic tests. Coordinate live resolution wiring with main; do not import an unfinished B implementation.

## Run on separate ports

In separate terminals:

```powershell
# Agent A
Set-Location "C:\Users\myste\Desktop\shopmate-frontend"
npm run dev -- --port 3001
```

```powershell
# Agent B
Set-Location "C:\Users\myste\Desktop\shopmate-store-discovery"
# Only B's future live implementation needs a local Google key.
Copy-Item .env.example .env.local
npm run dev -- --port 3002
```

```powershell
# Agent C
Set-Location "C:\Users\myste\Desktop\shopmate-optimization"
npm run dev -- --port 3003
```

Do not overwrite an existing `.env.local`; create it only if absent. Populate the Google key locally without putting it in chat, shell arguments, or Git. Each worktree has its own `node_modules/`, `.next/`, and environment. Each full checkout can run its own same-origin UI/API; the final main integration joins the workstreams. Cross-origin configuration is not required for parallel implementation.

## Integrate one branch at a time

Have each agent finish checks and commit its changes. In the original checkout:

```powershell
Set-Location "C:\Users\myste\Desktop\shopmate"
git switch main
git status --short
git merge --no-ff feat/store-discovery
npm run verify
git merge --no-ff feat/optimization
npm run verify
git merge --no-ff feat/frontend
npm run verify
```

Stop on a failed merge or check, resolve it with the relevant owner, and rerun verification before the next merge. Main then completes cross-provider composition, actual journey tests, attribution/policy UI, and release checks. These commands are a suggested order, not permission to merge unfinished work.

Before an agent rebases onto newer main, stop its work and commit first; perform the rebase from that agent's own worktree. Do not check out an active feature branch in the main checkout. Cleanup/removing worktrees is deliberately omitted until all work is integrated and reviewed.
