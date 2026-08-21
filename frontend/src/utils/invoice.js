import { computeOrderTotal, formatCents } from './pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function buildInvoiceLines(order) {
  const total = computeOrderTotal(order);
  if (total === null) return null;

  const lines = [
    'Order Support Assistant — Invoice',
    '',
    `Order: ${order.order_number}`,
    `Product: ${order.product_name}`,
    `Date: ${dateFormatter.format(new Date(order.created_at))}`,
    '',
    `Original price: ${formatCents(order.unit_price_cents)}`,
    `Delivery: ${order.delivery_cost_cents ? formatCents(order.delivery_cost_cents) : 'Free'}`,
    `VAT: ${formatCents(order.vat_cents || 0)}`,
  ];
  if (order.voucher_cents > 0) {
    lines.push(`Voucher${order.voucher_code ? ` (${order.voucher_code})` : ''}: -${formatCents(order.voucher_cents)}`);
  }
  lines.push(`Total: ${formatCents(total)}`);

  return lines;
}

// A real, working download via a client-side Blob, not a PDF service or a
// second backend endpoint, since nothing here needs one.
export function downloadInvoice(order) {
  const lines = buildInvoiceLines(order);
  if (lines === null) return;

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${order.order_number}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function invoiceMailtoUrl(order) {
  const lines = buildInvoiceLines(order);
  if (lines === null) return null;

  const subject = `Your Order Support Assistant receipt — ${order.order_number}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
