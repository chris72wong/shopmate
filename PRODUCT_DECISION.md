# ShopMate: meals into groceries

November 8 rescue decision: make the primary experience a genuine Gemini-powered meal planner with deterministic ingredient consolidation, individual meal swaps, a checkable grocery list, copy/download and verified regional retailer search links. Preserve ShopMate's illustrations and theme. Remove retailer-price availability as a prerequisite for meal planning.

Gemini 3.5 Flash-Lite creates structured original recipes for the household, budget intention and dietary preferences. Zod and server-side dietary checks reject malformed or obviously incompatible output. Budget is guidance, never an invented price or an assurance that groceries fit the budget.

ShopMate's differentiator is the continuously recalculated shopping list: merge shared ingredients across meals while preserving units and dry/drained/edible states; swap one meal without regenerating the others; mark groceries already available; copy or download shopping quantities and search genuine retailer websites. No price, inventory, savings, matched product or cart is fabricated.

Share-A-Cart requires an application credential or interactive approval unavailable in this checkout. Authenticated retailer support and Canadian cart capability remain unverified. Ship honest search links. See [the investigation](docs/SHARE_A_CART.md).

Google discovery stays optional and separate. Legacy `/demo` and v1/v2 optimizer APIs remain explicitly illustrative or evidence-gated, and are not the main journey. No new backend, dependency, pricing-feed speculation or broad architecture rewrite is needed.

Credentialed Gemini verification requires server-side `GEMINI_API_KEY`; absence must produce an explicit error with no sample fallback. See [the handoff](AGENT_HANDOFF.md) for actual checks and remaining limits.
