# ShopMate agent handoff

## Objective and branch

Deliver a distinctive, tested hackathon demo while preserving the existing design. Product: deterministic meal and whole-package grocery optimization, including single/mixed-store comparisons. See PRODUCT_DECISION.md.

Development branch: `codex/demo-ready`, based on `8c2b06b`. Main is unchanged. Reliability milestone commit: `7db73f0`; verified demo documentation: `eaffceb`. This handoff's push-status commit follows them; resolve the final branch tip with `git log -1 --oneline`.

## Existing functionality

Five-step CA/US planner, sample catalog, dietary/exclusion filters, household scaling, integer-cent budgets, consolidated package purchases, complete store comparisons, split purchases, recipes, nutrition estimates and shopping lists. Live Google and pricing adapters exist; current real-price coverage requires separate credentialed verification.

## Current priorities

Implementation, verification and local commits are complete. No further feature work is required for the chosen demonstration. Exact walkthrough and limitations: DEMO_GUIDE.md.

Push did **not** succeed. Automatic approval review rejected `git push -u origin codex/demo-ready` twice, including after outgoing-file inspection and remote verification. Its stated reason: repository source/documentation would be transmitted to an unverified external destination, and specific authorization for the payload/destination could not be established. No network write occurred. Existing origin is `https://github.com/chris72wong/shopmate.git`; read-only `git ls-remote` confirmed its main is exactly baseline `8c2b06b683f440f1826e6888d349191ab02d9a68`, and no remote demo-ready branch was returned. No bypass was attempted. An explicit approval request for this exact push is pending. After approval or manually in your own terminal, run `git push -u origin codex/demo-ready`, then compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/codex/demo-ready`. All local work is preserved.

## Completed reliability work

- Prevent optional ingredient-reuse comparison caps from crashing a valid optimized basket. Omit the unsupported savings claim with a notice, preserving the actual candidate-search proof.
- Keep shopping-list checks attached to store/ingredient/product identity across all-store and individual-store filters.
- Expand production HTTP checks for exact line sums, vegan/peanut constraints, household scaling and honest one-cent budget failure in both currencies.
- Read-only optimizer audit found the reuse bug; its separate 500-case package brute-force comparison found no other cost mismatch.

## Environment and commands

Node 24 recommended. `npm ci`, `npm run dev`; open `/demo`. No environment variables needed for the demo. Optional live settings are documented in `.env.example` and docs/PRICING.md; never commit values.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:smoke`, or all via `npm run verify`. Stop this checkout's dev/production server before building. `npm start -- --hostname 127.0.0.1 --port 3107` serves a built demo.

## Verification and blockers

November 8: `npm run verify` passed: lint, strict types, 629 tests passed / 5 opt-in tests skipped (31 files), production build, 35 production HTTP checks. Focused regression run: 6 tests passed. Dependency installation succeeded after stopping the old ShopMate server on port 3107. Installation reported 8 moderate advisories; a separate production-only audit could not reach the audit endpoint, so no fresh production audit result is claimed. No product blocker identified. Prices remain illustrative in demo; nutrition is estimated. No deployment or merge into main is authorized.

Production browser: CAD vegan/peanut-free five-meal plan (18.54 one store / 18.50 split), per-store checked-item retention, package details and successful copy; one-cent budget failure; US default and nutrition-priority plans; complete store comparisons. Narrow list inspection had no horizontal overflow (the browser reported an effective 300 CSS-pixel viewport despite a requested 390 override); override reset. Inspected browser warning/error log was empty. Keyboard-specific end-to-end coverage was not repeated; semantic control interactions and existing tests cover keyboard-capable native controls. Print dialog was not exercised. Production HTTP additionally verified USD 80 → USD 20 nutrition-priority reoptimization (37.48 → 14.04). Screenshot: ignored `artifacts/demo-comparison.jpg`.

The production review server is running in the agent exec session on loopback port 3107. Stop it before rebuilding. It may end with the host session; otherwise use the launch commands above. Browser screenshots are verification artifacts, not Git deliverables. Shopping checks reset on new results/strategy; plan state is not persisted after refresh. Repeated meals are expected and documented.
