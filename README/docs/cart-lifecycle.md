# Cart Lifecycle

In the current implementation of the Freedom Storefront (Internal Preview Phase), **there is no cart lifecycle**.

## Current Capabilities

The storefront templates and SDK currently support:
* Reading catalog data.
* Creating store drafts (\`createStore\`).
* Selecting products/creating listing drafts (\`selectProduct\`).
* Requesting supply confirmations (\`requestSupply\`).

## Missing Capabilities

The following features, necessary for a cart lifecycle, are explicitly **not implemented** in this repository at this stage:
* Public product feed.
* Purpose tokens for buyers.
* Cart management (adding/removing items).
* Checkout process.
* Orders.
* Payments.

The architecture emphasizes that public storefront endpoints, cart, and checkout will be handled by providing restricted public read/checkout APIs, which will not expose payment secrets or database connections directly in the templates or bundles.
