// Save For Later's mock saved-items list - like shopProducts.js, this app
// has no real wishlist backend (see App.jsx's own comment on the
// ComingSoonPage this replaces), so this is static content rather than a
// fetch. Joins to SHOP_PRODUCTS by productId instead of duplicating name/
// category/description/icon here, so this page can't drift out of sync
// with the real catalog those already come from.
//
// savedAtCents is wishlist-specific (the price when it was saved), not the
// catalog's own originalPriceCents (a manufacturer "was" price) - the two
// happen to be the same field on the keyboard entry below only because
// that product's one real catalog discount (see shopProducts.js) predates
// this list existing, not because the two concepts are the same thing.
export const WISHLIST_ITEMS = [
  { productId: 'headphones', savedAtCents: 16999, addedDaysAgo: 3, almostGone: false },
  { productId: 'keyboard', savedAtCents: 11999, addedDaysAgo: 3, almostGone: true },
  { productId: 'chair', savedAtCents: 24999, addedDaysAgo: 6, almostGone: false },
];
