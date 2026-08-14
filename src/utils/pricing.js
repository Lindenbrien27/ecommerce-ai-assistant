// src/utils/pricing.js
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCents(cents) {
  return currencyFormatter.format(cents / 100);
}

// Backend port of frontend/src/utils/pricing.js's computeOrderTotal - same
// field names, same formula. Duplicated rather than shared because the
// frontend and backend are two separate apps with no shared package
// between them. unit_price_cents is the one field that's never optional
// once present at all (see migrations/1785095226496_add-order-pricing-
// and-product-icon.sql) - callers treat that as "pricing data exists for
// this order."
function computeOrderTotal(order) {
  if (order.unit_price_cents == null) return null;
  return (
    order.unit_price_cents + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0)
  );
}

module.exports = { formatCents, computeOrderTotal };
