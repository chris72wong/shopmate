# ShopMate frontend

The homepage uses one headline, one sentence and one primary action. Three short steps explain the journey. Original groceries provide the colour and motion; no stock photos, star decorations, marketing badges, handwritten slogans or sidebar pitch remain. A regression check caps homepage copy at 70 words.

`AnimatedGroceries` provides a pause/play control. CSS animations and transitions respect reduced-motion preferences. The planner stays in one column with concise labels, visible progress and expandable price, ingredient and recipe details.

Demo stores remain fictional, prices remain labeled illustrative or verified, and nutrition remains estimated. Missing prices never create a zero-cost basket. Google attribution, quote provenance, currency and search-limit semantics are preserved. Backend code, contracts, catalog, configuration and dependencies are unchanged.

The local Next.js environment requires the documented `--webpack` build option because the default Turbopack build worker fails. The preceding design's verification history is retained in Git; current checks are recorded below.

Current verification: lint, strict typecheck and 256 tests passed (4 credential-gated tests skipped). The Webpack production build passed, followed by all 27 HTTP smoke requests. Browser checks covered desktop and 320/390px mobile widths, pause/play, postal validation, expandable store prices, CA/US sample plans, comparisons, copying lists and keyboard grocery checks. The production homepage body has 45 words; inspected views had no horizontal overflow or browser warnings/errors. Provider-backed live success remains unverified without credentials.
