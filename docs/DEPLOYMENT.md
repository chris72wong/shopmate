# Vercel release preparation

The foundation uses standard Next.js App Router/Node route handlers, without a custom server or database. It is structured for Vercel, but this task does not deploy or create a remote repository.

## Foundation preview

1. Use Node.js 24 and install with `npm ci`.
2. Run `npm run verify` locally. This includes a production build and HTTP checks.
3. For a later Vercel import, select the Next.js preset, repository root, install command `npm ci`, and build command `npm run build`; leave output settings at the preset default.
4. Demo mode needs no environment variables. Live discovery and optimization remain intentionally unavailable until implemented.

For local production serving: `npm run build`, then `npm start`. Stop a dev server in the same checkout before building. The repository has no Git remote until one is intentionally configured.

## Enable live discovery after implementation

- Configure a Google Cloud project with billing and both Geocoding API and Places API (New) enabled.
- Set `GOOGLE_MAPS_API_KEY` in the server environment (`.env.local` locally, Vercel environment settings in deployment). Never add a `NEXT_PUBLIC_` prefix or commit the value.
- Restrict the key to the required APIs and an appropriate server-key restriction strategy for the deployment. Do not assume a browser referrer restriction protects server calls.
- Set quotas/budgets and implement deadlines, bounded search parameters, sanitized logs, and appropriate request abuse/rate controls before making paid APIs public.
- Missing keys and quota/provider failures must remain visible structured errors, never fake demo search results.
- Render the official Google Maps logo and required third-party attribution according to current policies. Preserve Maps links and attribution metadata from discovery.
- Provide applicable public Terms of Use and Privacy Policy pages before exposing Google data. Do not ship placeholder legal copy as a completed policy.
- Review Google content retention rules. No persistent store/search payload cache or production response fixtures are included here.

## Final MVP release gate

- Full demo journey works without credentials, with visible fictional-store and illustrative-price labels.
- Real nearby results are returned only from successful server-side Google requests, with correct country/radius handling and attribution.
- Unsupported chains/missing prices cannot appear as cheaper complete baskets.
- Package arithmetic, constraints, budget boundaries, deterministic scoring, and no-feasible/incomplete search behavior pass meaningful tests.
- Desktop/mobile and keyboard checks cover loading, empty, errors, results, and no-feasible states.
- `npm run verify` passes on the final integrated commit. Inspect production dependency advisories with `npm audit --omit=dev`; review tooling advisories separately without blindly applying `--force` major downgrades.
- No credentials, postal-code/precise-location logs, copied Google payloads, or generated build artifacts are committed.

## Foundation dependency advisory

At initial installation, npm reported eight moderate advisory entries in the **development lint dependency tree**, all propagated from `minimatch` through `typescript-eslint`/`eslint-config-next`. The reported advisory is [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), concerning glob-pattern amplification. npm's suggested fix changes major Next lint configuration versions, so it was not applied blindly. Lint inputs in this repository are local project files; no application API exposes these tools. Recheck upstream compatible fixes before release. `npm audit --omit=dev` reported **zero production advisories** during foundation verification on November 7, 2026.
