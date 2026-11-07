# Foundation verification

Verified locally on November 7, 2026, using Windows PowerShell, Node.js 24.15.0, and npm 11.12.1.

`npm install` completed and produced the committed npm lockfile. Installed core versions are Next.js 16.4.5 and React 19.3.1, with Tailwind v4, Zod v4, and Vitest 5.1.0.

## Completed checks

The final `npm run verify` run passed all five stages:

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed with zero warnings |
| `npm run typecheck` | Passed with strict TypeScript and unchecked-index checking |
| `npm test` | 4 files, 63 tests passed |
| `npm run build` | Production build completed; home, demo, API routes, 404, and icon generated |
| `npm run test:smoke` | 13 real HTTP requests passed against an automatically started/stopped production server |

The HTTP checks covered the home page and generated brand CSS, CA/US demo pages and discovery responses, health capabilities, 404, malformed JSON, schema validation, and intentional 501 responses for live discovery/optimization. A separate `npm run dev -- --hostname 127.0.0.1` startup and home-page HTTP request also succeeded.

Browser inspection covered wide/narrow landing and pantry layouts, no horizontal overflow in the inspected viewports, navigation into the demo, and the visible currency switch from CAD to USD with independent sample prices. Fictional-store, illustrative-price, and estimated-nutrition labels were present. This was a manual browser inspection, not an automated accessibility audit or a full meal-planning E2E test.

`npm audit --omit=dev --json` reported zero production vulnerabilities. The full install audit reported eight moderate development lint-tree advisory entries; details and the upstream advisory link are recorded in `DEPLOYMENT.md`.

## Limits

- Google live discovery and optimization are intentionally unimplemented. Their valid requests return typed 501 responses. No external-key or optimizer behavior is claimed as tested.
- Google attribution UI, public policy pages, public paid-API request controls, and the full five-step user journey remain future work.
- CI configuration is included, but no remote repository or GitHub Actions run was created. Vercel was not deployed.
- No worktrees or subagents were created. The preview server was stopped after inspection; run `npm run dev` to restart it.

## Country-first UI revision

Re-ran `npm run verify` after replacing the marketing landing page with country selection and a validated postal/ZIP field: lint, strict types, all 63 tests, the production build, and all 13 HTTP smoke requests passed. Browser checks covered both countries, empty/invalid input, Canadian normalization, leading-zero ZIP codes, keyboard submission, focus on country changes, retained input within the flow, and correct CAD/USD demo navigation. Narrow layouts had no horizontal overflow. The recipe library starts collapsed and expands successfully. Live discovery remains unimplemented; continuing explicitly opens fictional demo stores. The postal code stays in component state and is not included in the demo URL or sent to a server.
