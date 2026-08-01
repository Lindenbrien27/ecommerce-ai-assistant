const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents) {
  return currencyFormatter.format(cents / 100);
}

// unit_price_cents is the one field of the four that's never optional once
// present at all (see migrations/1785095226496_add-order-pricing-and-
// product-icon.sql) - callers treat that as "pricing data exists for this
// order" and skip rendering a summary with holes in it for any order
// seeded before that migration, same convention OrderDetailPage's own
// OrderSummary already used before this was pulled out to be shared with
// the Active Order Spotlight's invoice download.
export function computeOrderTotal(order) {
  if (order.unit_price_cents == null) return null;
  return (
    order.unit_price_cents + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0)
  );
}
