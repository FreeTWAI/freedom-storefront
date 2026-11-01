# Storefront Architecture

The storefront architecture is designed to be a lightweight, forkable set of templates, SDK, and local HTML preview tools. It relies on the central `freedom-platform` for data storage (members, products, supply terms, stores).

## Core Concepts

* **Templates**: Located in `templates/`, there are currently four layout types:
  * `master-store`: Reference product catalog for members (no buying capability).
  * `catalog-store`: Preview of a specific store's selected products and supply status.
  * `single-product`: Preview of a specific store and a single product selection with saved price versions.
  * `service-offer`: Placeholder for future service store API, without fake booking/buying capabilities.
* **Storefront SDK**: Located in `packages/storefront-sdk/`, it provides a thin wrapper around the shared API client to fetch and process data.
  * Functions: `loadStorefront`, `createStore`, `selectProduct`, `requestSupply`.
  * SDK functions do not perform automatic retries, hold database connections, or manage payment secrets.
* **Rendering**: Handled by `packages/templates/index.mjs` (`renderPreview`), which generates offline-capable HTML previews from snapshots. The renderer is pure and network-free. It does not fetch remote images/scripts.
* **Data Flow**:
  * `client/` holds the shared connection logic, referencing the connection file (`~/.config/freedom-clients/storefront.json`).
  * `loadConnectedStorefront` reads catalog, stores, and listings for the approved store based on the connection token.
  * The token must stay outside the repository.
* **Internal Preview**: The current phase is an internal preview. Public API, checkout, orders, payments, and publishing are not implemented in this repository.

## Component Hierarchy

The components are primarily layout templates without client-side interactive frameworks (like React/Vue) in the traditional sense, as they render to static HTML for local preview.

* **HTML Structure**:
  * Header: Displays template-specific heading, description, and an internal preview badge.
  * Main Content Grid (`<div class="grid">`):
    * Contains product cards (`productCard`) or listing cards (`listingCard`) depending on the template.
    * `productCard`: Shows product title, specs, supplier, reference price, stock, and shipping terms.
    * `listingCard`: Shows listing state, title, specs, retail price, sale terms, shipping/return terms, and saved versions.
  * Contact Section: Added for seller templates, showing store support contact.
  * Footer: Contains warnings about private data and timestamp.
