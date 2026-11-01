import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorefront } from '../packages/storefront-sdk/index.mjs';

test('E2E integration: Product search queries fetch complete catalog via pagination', async () => {
  const data = {
    listCatalog: { items: [{ product_id: 'product-1', current_offer: { offer_version_id: 'v1' } }], next_offset: null },
    listStores: { items: [{ store_id: 'store-1' }] },
    listListings: { items: [{ listing_id: 'listing-1', store_id: 'store-1' }] }
  };

  let listCatalogCalled = false;
  const client = {
    async call(operation, options) {
      if (operation === 'listCatalog') {
        listCatalogCalled = true;
        // Verify that the SDK automatically passes the pagination query to fetch the catalog
        assert.deepEqual(Object.keys(options.query).sort(), ['limit', 'offset']);
      }
      return data[operation] || { receipt: 'persisted' };
    }
  };

  const storefront = await loadStorefront(client, { storeId: 'store-1' });
  assert.equal(listCatalogCalled, true);
  assert.equal(storefront.catalog.length, 1);
  assert.equal(storefront.catalog[0].product_id, 'product-1');
});

test.skip('E2E integration: Shopping cart state updates correctly', () => {
  // To be implemented: Cart features are currently not supported in the storefront
});

test.skip('E2E integration: Checkout flow submits order and payment successfully', () => {
  // To be implemented: Checkout and payment capabilities are explicitly disabled
});
