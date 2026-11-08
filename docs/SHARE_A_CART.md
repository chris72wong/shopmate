# Shopping handoff verification — November 8, 2026

Decision: ship a consolidated checklist, copy/download and real retailer **search** links. No cart, stock, product match or retailer price is claimed.

The [official Share-A-Cart quickstart](https://share-a-cart.com/developers/docs/quickstart) states that embedding its server in a project requires an application API key. Connecting a personal MCP client instead requires interactive account sign-in and access approval. No Share-A-Cart application credential was configured in this checkout. Direct HTTPS probes from the shell failed under the current network restrictions; official documentation was read using web search. No authenticated vendor-list, product-search or cart-creation call ran, and no cart link was produced.

The [official MCP developer article](https://share-a-cart.com/blog/mcp-for-devs) distinguishes retailers supported by the browser extension from retailers with direct search, using each vendor's `searchable` flag. Its generic Walmart/Kroger coverage is **not** proof of Walmart Canada, Loblaws, or any particular regional API capability. Those remain unverified until authorized vendor-list/product/cart calls can run.

Verified public retailer search pages, opened through the web tool and returning ingredient results:

- [Walmart Canada rice search](https://www.walmart.ca/en/search?q=rice): Canadian `/en/search?q=` route.
- [Walmart US rice search](https://www.walmart.com/search?q=rice): US `/search?q=` route.
- [Kroger rice search](https://www.kroger.com/search?query=rice): US `/search?query=` route.

Only these verified routes are generated. Queries are encoded as a single parameter. Search links do not select the user's local branch or prove grocery availability, pricing, delivery or dietary suitability; those require the retailer's own location/account/product-label checks. No retailer content or observed prices were copied into ShopMate.
