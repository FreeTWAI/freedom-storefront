# Product Filtering State Machine

The product filtering process within the SDK operates primarily to isolate data relevant to the authorized scope (the specific store) rather than acting as a security boundary.

## Filtering Flow (\`loadStorefront\`)

1. **Data Fetching**: The SDK calls the central API (\`listCatalog\`, \`listStores\`, \`listListings\`). \`listCatalog\` handles pagination (up to 50 items per page) until \`next_offset\` is null.
2. **Store Filtering**:
   * If a \`storeId\` is provided, the \`availableStores\` are filtered to match the requested \`storeId\`.
   * The SDK verifies that exactly one store matches the requested \`storeId\`.
3. **Listing Filtering**:
   * \`visibleStoreIds\` is a set of the filtered stores' IDs.
   * \`availableListings\` are filtered to only include listings where \`listing.store_id\` exists in \`visibleStoreIds\`.
4. **Result**: The returned snapshot contains only the stores and listings relevant to the requested context.

## State Transitions (Listings)

Listings have states reflecting their supply status:
* \`draft\` (選品草稿): Initial selection draft.
* \`requested\` (等待供貨商確認): Awaiting confirmation from the supplier.
* \`accepted\` (供貨已確認（內部演練）): Supply confirmed (internal exercise, not a binding contract/QA/payment).
* \`declined\` (供貨未接受): Supply not accepted.

*Note: The SDK's filtering is to prevent accidental data mixing in the UI, not a replacement for API-level authorization. The API remains the authority for membership and ownership.*
