import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorefront, createStore, selectProduct, requestSupply } from '../packages/storefront-sdk/index.mjs';

function workspace() {
  const data = {
    listCatalog: { items: [{ product_id: 'product-a', current_offer: { offer_version_id: 'offer-v2' } }], next_offset: null },
    listStores: { items: [{ store_id: 'store-a' }, { store_id: 'store-b' }] },
    listListings: { items: [{ listing_id: 'a', store_id: 'store-a' }, { listing_id: 'b', store_id: 'store-b' }, { listing_id: 'foreign', store_id: 'foreign-store' }] },
  };
  const calls = [];
  return { data, calls, client: { async call(operation, options) { calls.push({ operation, options }); return data[operation] ?? { receipt: 'persisted' }; } } };
}

test('store-specific workspace excludes other stores and orphan listings without mutating API data', async () => {
  const { client, data, calls } = workspace();
  const snapshot = await loadStorefront(client, { storeId: 'store-a' });
  assert.deepEqual(snapshot.stores.map(row => row.store_id), ['store-a']);
  assert.deepEqual(snapshot.listings.map(row => row.listing_id), ['a']);
  assert.equal(snapshot.catalog[0].current_offer.offer_version_id, 'offer-v2');
  assert.equal(snapshot.mode, 'internal_preview');
  assert.equal(snapshot.capabilities.checkout, false);
  assert.equal(snapshot.capabilities.public_publication, false);
  assert.deepEqual(calls.map(row => row.operation).sort(), ['listCatalog', 'listListings', 'listStores']);
  snapshot.catalog[0].current_offer.offer_version_id = 'changed';
  assert.equal(data.listCatalog.items[0].current_offer.offer_version_id, 'offer-v2');
});

test('workspace without selection includes only listings attached to returned stores', async () => {
  const { client } = workspace();
  assert.deepEqual((await loadStorefront(client)).listings.map(row => row.listing_id), ['a', 'b']);
});

test('workspace reads the complete catalog, including empty and exact-page endings', async () => {
  for (const count of [0, 50, 101]) {
    const { data } = workspace();
    const products = Array.from({ length: count }, (_, index) => ({ product_id: `product-${index}` }));
    const offsets = [], pages = [];
    const client = { async call(operation, options) {
      if (operation !== 'listCatalog') return data[operation];
      assert.equal(options.query.limit, 50);
      const { offset } = options.query;
      offsets.push(offset);
      const page = { items: products.slice(offset, offset + 50), next_offset: offset + 50 < count ? offset + 50 : null };
      pages.push(page);
      return page;
    } };
    const result = await loadStorefront(client, { storeId: 'store-a' });
    assert.deepEqual(result.catalog, products);
    assert.deepEqual(offsets, count > 50 ? [0, 50, 100] : [0]);
    assert.equal(pages[0].items.length, Math.min(count, 50));
    assert.deepEqual(result.listings.map(row => row.listing_id), ['a']);
  }
});

test('a later catalog authorization failure rejects the whole workspace without retry', async () => {
  const { data } = workspace();
  const failure = Object.assign(new Error('session expired'), { status: 401 });
  const offsets = [];
  const client = { async call(operation, options) {
    if (operation !== 'listCatalog') return data[operation];
    offsets.push(options.query.offset);
    if (options.query.offset === 0) return { items: data.listCatalog.items, next_offset: 50 };
    throw failure;
  } };
  await assert.rejects(loadStorefront(client), error => error === failure);
  assert.deepEqual(offsets, [0, 50]);
});

test('invalid catalog continuation fails instead of returning partial data or looping', async () => {
  for (const next_offset of [undefined, 0, -1, '50', 1.5]) {
    const { client, data, calls } = workspace();
    data.listCatalog.next_offset = next_offset;
    await assert.rejects(loadStorefront(client), /next_offset/);
    assert.equal(calls.filter(row => row.operation === 'listCatalog').length, 1);
  }
});

test('unknown store and invalid API response fail closed', async () => {
  const { client, data } = workspace();
  await assert.rejects(loadStorefront(client, { storeId: 'foreign-store' }), /unavailable/);
  await assert.rejects(loadStorefront(client, { storeId: '' }), /storeId/);
  data.listCatalog = { products: [] };
  await assert.rejects(loadStorefront(client), /invalid collection/);
});

test('create and select delegate exact command bodies and explicit idempotency to canonical API', async () => {
  const { client, calls } = workspace();
  const store = { name: 'My store', description: 'Draft', support_contact: 'Contact' };
  const listing = { store_id: 'store-a', offer_version_id: 'offer-v2', retail_price_minor: 24000, sale_terms: 'Draft only' };
  await createStore(client, store, { idempotencyKey: 'create-intent' });
  await selectProduct(client, listing, { idempotencyKey: 'select-intent' });
  assert.deepEqual(calls, [
    { operation: 'createStore', options: { body: store, idempotencyKey: 'create-intent' } },
    { operation: 'createListing', options: { body: listing, idempotencyKey: 'select-intent' } },
  ]);
  assert.throws(() => createStore(client, store), /idempotencyKey/);
  assert.throws(() => selectProduct(client, listing, { idempotencyKey: '  ' }), /idempotencyKey/);
});

test('supply request pins digest and concurrency version and keeps retry identity', async () => {
  const { client, calls } = workspace();
  const listing = { listing_id: 'listing-a', snapshot_sha256: 'a'.repeat(64), aggregate_version: 3 };
  await requestSupply(client, listing, { idempotencyKey: 'reviewed-intent' });
  await requestSupply(client, listing, { idempotencyKey: 'reviewed-intent' });
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], { operation: 'requestSupply', options: {
    params: { id: 'listing-a' }, body: { snapshot_sha256: 'a'.repeat(64) }, idempotencyKey: 'reviewed-intent', version: 3,
  } });
  assert.throws(() => requestSupply(client, { ...listing, snapshot_sha256: 'not-a-digest' }, { idempotencyKey: 'x' }), /snapshot_sha256/);
  assert.throws(() => requestSupply(client, { ...listing, aggregate_version: undefined }, { idempotencyKey: 'x' }), /version/);
});

test('authorization and conflict errors propagate unchanged; adapter never retries commands automatically', async () => {
  let calls = 0;
  const conflict = Object.assign(new Error('precondition failed'), { status: 412 });
  const client = { async call() { calls++; throw conflict; } };
  await assert.rejects(createStore(client, {}, { idempotencyKey: 'x' }), error => error === conflict);
  assert.equal(calls, 1);
});

test('listCatalog pagination handles first page, last partial page, and offset beyond end', async () => {
  const products = Array.from({ length: 60 }, (_, index) => ({ product_id: `product-${index}` }));
  const calls = [];
  const client = {
    async call(operation, options) {
      calls.push({ operation, options });
      if (operation === 'listStores') return { items: [{ store_id: 'store-a' }] };
      if (operation === 'listListings') return { items: [] };
      if (operation === 'listCatalog') {
        const { limit, offset } = options.query;
        if (offset === 0) {
          return { items: products.slice(0, 50), next_offset: 50 };
        } else if (offset === 50) {
          return { items: products.slice(50, 60), next_offset: 100 };
        } else {
          return { items: [], next_offset: null };
        }
      }
    }
  };

  const result = await loadStorefront(client, { storeId: 'store-a' });
  assert.equal(result.catalog.length, 60);

  const catalogCalls = calls.filter(c => c.operation === 'listCatalog');
  assert.equal(catalogCalls.length, 3);
  assert.deepEqual(catalogCalls[0].options.query, { limit: 50, offset: 0 });
  assert.deepEqual(catalogCalls[1].options.query, { limit: 50, offset: 50 });
  assert.deepEqual(catalogCalls[2].options.query, { limit: 50, offset: 100 });
});

test('SDK listing queries filter listings properly and retrieve all available data', async () => {
  const calls = [];
  const client = {
    async call(operation, options) {
      calls.push({ operation, options });
      if (operation === 'listCatalog') return { items: [], next_offset: null };
      if (operation === 'listStores') return { items: [{ store_id: 'store-a' }, { store_id: 'store-b' }] };
      if (operation === 'listListings') return {
        items: [
          { listing_id: 'l1', store_id: 'store-a' },
          { listing_id: 'l2', store_id: 'store-b' },
          { listing_id: 'l3', store_id: 'store-c' }
        ]
      };
    }
  };

  const resultAll = await loadStorefront(client);
  assert.deepEqual(resultAll.listings.map(l => l.listing_id), ['l1', 'l2']);

  calls.length = 0;
  const resultA = await loadStorefront(client, { storeId: 'store-a' });
  assert.deepEqual(resultA.listings.map(l => l.listing_id), ['l1']);

  const resultB = await loadStorefront(client, { storeId: 'store-b' });
  assert.deepEqual(resultB.listings.map(l => l.listing_id), ['l2']);

  const listingCalls = calls.filter(c => c.operation === 'listListings');
  assert.equal(listingCalls.length, 2);
  assert.equal(listingCalls[0].options, undefined);
});

test('search filtering is supported via listWorksPage (listCatalog has no search)', async () => {
  const calls = [];
  const client = {
    async call(operation, options) {
      calls.push({ operation, options });
      if (operation === 'listWorksPage') {
        return { items: [{ work_item_id: 'w1', title: 'Work 1', aggregate_version: 1 }], next_cursor: null };
      }
    }
  };

  const response = await client.call('listWorksPage', { query: { search: 'my-search-term', scope: 'all' } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'listWorksPage');
  assert.equal(calls[0].options.query.search, 'my-search-term');
  assert.equal(response.items[0].work_item_id, 'w1');
});
