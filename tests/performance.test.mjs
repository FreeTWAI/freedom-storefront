import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorefront } from '../packages/storefront-sdk/index.mjs';

test('loadStorefront latency benchmark with large dataset', async () => {
  const NUM_ITEMS = 5000;

  const catalogItems = Array.from({ length: NUM_ITEMS }, (_, i) => ({
    product_id: `product-${i}`,
    title: `Product ${i}`,
    current_offer: { offer_version_id: `offer-v${i}` }
  }));

  const storesItems = Array.from({ length: 50 }, (_, i) => ({
    store_id: `store-${i}`,
    name: `Store ${i}`
  }));

  const listingsItems = Array.from({ length: NUM_ITEMS }, (_, i) => ({
    listing_id: `listing-${i}`,
    store_id: `store-${i % 50}`,
    product_id: `product-${i}`
  }));

  const data = {
    listCatalog: { items: catalogItems, next_offset: null },
    listStores: { items: storesItems },
    listListings: { items: listingsItems },
  };

  const client = {
    async call(operation) {
      return data[operation] ?? {};
    }
  };

  const start = performance.now();
  const snapshot = await loadStorefront(client);
  const end = performance.now();

  const duration = end - start;
  console.log(`loadStorefront with ${NUM_ITEMS} items took ${duration.toFixed(2)}ms`);

  assert.equal(snapshot.catalog.length, NUM_ITEMS);
  assert.equal(snapshot.stores.length, 50);
  assert.equal(snapshot.listings.length, NUM_ITEMS);
});
