const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents) {
  return currencyFormatter.format(cents / 100);
}

export function computeOrderTotal(order) {
  if (order.unit_price_cents == null) return null;
  return (
    order.unit_price_cents + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0)
  );
}
