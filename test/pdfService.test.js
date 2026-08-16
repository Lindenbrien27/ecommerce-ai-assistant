// test/pdfService.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeOrderTotal, formatCents } = require('../src/utils/pricing');
const { buildInvoiceFields, buildPackingSlipFields, buildInvoicePdf, buildPackingSlipPdf } = require('../src/services/pdfService');

const FULL_ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane.doe@example.com',
  product_name: 'Wireless Headphones',
  created_at: '2026-07-24T00:00:00Z',
  unit_price_cents: 40000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 1000,
  voucher_code: 'SPRING15',
  recipient_name: 'Jane Doe',
  address_line1: '482 Maple Street',
  address_line2: null,
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  country: 'US',
};

test('computeOrderTotal adds delivery/vat and subtracts the voucher', () => {
  assert.equal(computeOrderTotal(FULL_ORDER), 40000 + 500 + 0 - 1000);
});

test('computeOrderTotal returns null when there is no pricing data', () => {
  assert.equal(computeOrderTotal({ ...FULL_ORDER, unit_price_cents: null }), null);
});

test('formatCents formats cents as USD', () => {
  assert.equal(formatCents(40000), '$400.00');
});

test('buildInvoiceFields returns a full field object for an order with an address and pricing', () => {
  const fields = buildInvoiceFields(FULL_ORDER);
  assert.equal(fields.orderNumber, 'ORD-1001');
  assert.equal(fields.productName, 'Wireless Headphones');
  assert.deepEqual(fields.address, ['Jane Doe', '482 Maple Street', 'Austin, TX 78701', 'US']);
  assert.equal(fields.total, formatCents(40000 + 500 + 0 - 1000));
  assert.deepEqual(fields.voucher, { code: 'SPRING15', amount: formatCents(1000) });
});

test('buildInvoiceFields returns null when there is no shipping address', () => {
  assert.equal(buildInvoiceFields({ ...FULL_ORDER, address_line1: null }), null);
});

test('buildInvoiceFields returns null when there is no pricing data', () => {
  assert.equal(buildInvoiceFields({ ...FULL_ORDER, unit_price_cents: null }), null);
});

test('buildPackingSlipFields never includes any pricing field', () => {
  const fields = buildPackingSlipFields(FULL_ORDER);
  assert.deepEqual(Object.keys(fields).sort(), ['address', 'orderNumber', 'productName', 'quantity']);
  assert.equal(fields.quantity, 1);
});

test('buildPackingSlipFields returns null when there is no shipping address', () => {
  assert.equal(buildPackingSlipFields({ ...FULL_ORDER, address_line1: null }), null);
});

test('buildInvoicePdf returns a real PDF buffer when fields are present', async () => {
  const pdf = await buildInvoicePdf(FULL_ORDER);
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 0);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

test('buildInvoicePdf returns null when there is no shipping address', async () => {
  const pdf = await buildInvoicePdf({ ...FULL_ORDER, address_line1: null });
  assert.equal(pdf, null);
});

test('buildPackingSlipPdf returns a real PDF buffer when fields are present', async () => {
  const pdf = await buildPackingSlipPdf(FULL_ORDER);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
