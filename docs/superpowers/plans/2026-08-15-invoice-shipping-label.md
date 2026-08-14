# Invoice & Shipping Label Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin, from the existing order-detail page, a real PDF invoice and packing slip per order, plus a carrier/tracking-number update flow that auto-emails the customer.

**Architecture:** A new `shipping_address` column set on `orders` (with a backfill for existing seed data), a `pdfService.js` that builds invoice/packing-slip PDFs via `pdfkit`, a new `PATCH .../shipping` endpoint that updates carrier/tracking and conditionally emails the customer via a new `emailService` export, and an extension of the existing `AdminOrderDetailPage.jsx` — no new pages, no new auth.

**Tech Stack:** Node/Express, `pg`, `node-pg-migrate`, `nodemailer`, `pdfkit` (new dependency), `node:test`. React/Vite frontend, Vitest + Testing Library.

## Global Constraints

- Real order statuses / existing admin auth are unchanged — this plan only adds columns and new admin-gated endpoints.
- No order in the system may end up with a placeholder address like `"N/A"` — every backfilled order gets a real, plausible address.
- `CheckoutPage.jsx` is explicitly out of scope — it has no real backend, and this plan does not touch it.
- Packing slips never include pricing information (real-world warehouse-slip convention, stated in the spec).
- A no-op shipping-info re-save (carrier/tracking unchanged) must never re-email the customer.
- All new endpoints require `requireAdminAuth` (existing middleware, already mounted at the `/api/admin/orders` router level in `src/app.js`).
- Follow this codebase's existing test split: service-level tests mock `pool.query` directly; route-level tests use the `withServer`/`issueAdminToken` pattern (`test/adminOrders.test.js`); frontend tests render through `AdminAuthProvider` with a mocked `global.fetch`, same pattern as `AdminOrderDetailPage.test.jsx`.

---

### Task 1: Shipping-address schema + backfill

**Files:**
- Create: `migrations/<ts>_add-shipping-address-to-orders.sql` (timestamp assigned by `npm run migrate:create`)
- Create: `migrations/<ts>_backfill-order-shipping-addresses.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `orders` gains nullable columns `recipient_name`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country` — all consumed via `SELECT *`, which every existing order query (`orderService.getOrderByNumber`, `adminOrderService.getAdminOrders`) already uses, so no other file needs to change for the new columns to flow through the API. Every order seeded before this migration has a real, non-null address after the backfill.

- [ ] **Step 1: Create and write the schema migration**

Run: `npm run migrate:create add-shipping-address-to-orders`

This generates a timestamped file in `migrations/`. Replace its contents with:

```sql
-- Up Migration

-- Packing slips and invoices need a real ship-to address, and none exists
-- anywhere yet (not on orders, not collected at checkout - see the design
-- spec's own finding). recipient_name is separate from customer_email/
-- customer_profiles.name since a shipment's recipient can differ from the
-- account holder (an office, a gift recipient). Nullable, matching how
-- carrier/tracking_number are already nullable on this table - an order
-- can exist before it has shipping info.
ALTER TABLE orders
  ADD COLUMN recipient_name TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN postal_code TEXT,
  ADD COLUMN country TEXT;

-- Down Migration

ALTER TABLE orders
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS country;
```

- [ ] **Step 2: Create and write the backfill migration**

Run: `npm run migrate:create backfill-order-shipping-addresses`

Replace its contents with (one `UPDATE` per distinct customer email already present in this app's seed data — every order from the same seeded customer ships to the same address, which is the simplest plausible backfill):

```sql
-- Up Migration

-- Every order seeded so far belongs to one of these five customers (see
-- migrations/1784973065584_initial-schema.sql,
-- 1785245334753_add-lindenbrien-seed-orders.sql,
-- 1785410305029_add-lindenbrien-volume-history-orders.sql,
-- 1785631599842_add-dev-seed-account.sql). Keyed on customer_email, not
-- order_number, since backfilling one real address per customer is
-- simpler and just as plausible as inventing a distinct one per order.

UPDATE orders SET
  recipient_name = 'Jane Doe',
  address_line1 = '482 Maple Street',
  address_line2 = NULL,
  city = 'Austin',
  state = 'TX',
  postal_code = '78701',
  country = 'US'
WHERE customer_email = 'jane.doe@example.com';

UPDATE orders SET
  recipient_name = 'John Smith',
  address_line1 = '910 Birch Avenue',
  address_line2 = 'Unit 4B',
  city = 'Denver',
  state = 'CO',
  postal_code = '80202',
  country = 'US'
WHERE customer_email = 'john.smith@example.com';

UPDATE orders SET
  recipient_name = 'Ada Lovelace',
  address_line1 = '17 Analytical Engine Way',
  address_line2 = NULL,
  city = 'Cambridge',
  state = 'MA',
  postal_code = '02139',
  country = 'US'
WHERE customer_email = 'ada.lovelace@example.com';

UPDATE orders SET
  recipient_name = 'Linden Brien',
  address_line1 = '1200 Riverside Drive',
  address_line2 = 'Apt 7',
  city = 'Portland',
  state = 'OR',
  postal_code = '97201',
  country = 'US'
WHERE customer_email = 'lindenbrien27@gmail.com';

UPDATE orders SET
  recipient_name = 'Dev Account',
  address_line1 = '1 Test Fixture Lane',
  address_line2 = NULL,
  city = 'Springfield',
  state = 'IL',
  postal_code = '62701',
  country = 'US'
WHERE customer_email = 'dev@example.com';

-- Down Migration

-- No-op: reverting this migration means "forget the addresses," which the
-- schema migration's own down (dropping the columns entirely) already
-- covers. Nothing to explicitly undo here.
```

- [ ] **Step 3: Apply both migrations**

Run: `npm run migrate:up`
Expected: both migrations report success in the command's own output.

- [ ] **Step 4: Verify via the existing test suite**

Run: `npm test`
Expected: PASS, no regressions (existing tests that mock `pool.query` and return partial rows are unaffected by new nullable columns; nothing currently asserts on the exact shape of a `SELECT *` result).

- [ ] **Step 5: Commit**

```bash
git add migrations/<schema-migration-file> migrations/<backfill-migration-file>
git commit -m "Add shipping address to orders, backfill existing seed orders"
```

---

### Task 2: PDF generation — `src/utils/pricing.js` + `src/services/pdfService.js`

**Files:**
- Create: `src/utils/pricing.js`
- Create: `src/services/pdfService.js`
- Test: `test/pdfService.test.js`
- Modify: `package.json` (add `pdfkit` dependency)

**Interfaces:**
- Consumes: nothing beyond a plain order row (the shape returned by `SELECT * FROM orders`, now including Task 1's new columns).
- Produces: `pricing.js` exports `formatCents(cents)`, `computeOrderTotal(order)` (backend port of the existing `frontend/src/utils/pricing.js` — duplicated across the frontend/backend boundary since there's no shared package between them, same field names and formula). `pdfService.js` exports `buildInvoiceFields(order)`, `buildPackingSlipFields(order)` (pure functions, no PDF library involved — return `null` or a plain field object), and `buildInvoicePdf(order)`, `buildPackingSlipPdf(order)` (both `async`, return `Promise<Buffer|null>`) — consumed directly by Task 4's controller handlers.

- [ ] **Step 1: Install pdfkit**

Run: `npm install pdfkit`

- [ ] **Step 2: Write the failing tests for `pricing.js` and the field builders**

```js
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/pdfService.test.js`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 4: Implement `src/utils/pricing.js`**

```js
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
```

- [ ] **Step 5: Implement `src/services/pdfService.js`**

```js
// src/services/pdfService.js
const PDFDocument = require('pdfkit');
const { formatCents, computeOrderTotal } = require('../utils/pricing');

function hasShippingAddress(order) {
  return Boolean(order.address_line1);
}

function addressLines(order) {
  const lines = [order.recipient_name, order.address_line1];
  if (order.address_line2) lines.push(order.address_line2);
  lines.push(`${order.city}, ${order.state || ''} ${order.postal_code}`.replace(/\s+/g, ' ').trim());
  lines.push(order.country);
  return lines.filter(Boolean);
}

// Pure content builder, no PDF library involved - mirrors the frontend's
// buildInvoiceLines/downloadInvoice split (frontend/src/utils/invoice.js)
// so the field/total logic is unit-testable without touching pdfkit or a
// PDF byte stream. Returns null when there's no shipping address on file
// yet, or no pricing data (mirrors computeOrderTotal's own "skip entirely,
// don't render a document with holes in it" convention) - either makes a
// real invoice impossible to produce.
function buildInvoiceFields(order) {
  if (!hasShippingAddress(order)) return null;
  const total = computeOrderTotal(order);
  if (total === null) return null;

  return {
    orderNumber: order.order_number,
    date: order.created_at,
    address: addressLines(order),
    productName: order.product_name,
    unitPrice: formatCents(order.unit_price_cents),
    delivery: order.delivery_cost_cents ? formatCents(order.delivery_cost_cents) : 'Free',
    vat: formatCents(order.vat_cents || 0),
    voucher: order.voucher_cents > 0 ? { code: order.voucher_code, amount: formatCents(order.voucher_cents) } : null,
    total: formatCents(total),
  };
}

// Deliberately excludes every pricing field - the standard real-world
// convention for a document warehouse staff handle (they don't need to
// know what the customer paid). Tested by asserting the exact key set
// below, not by grepping PDF bytes (pdfkit's output stream isn't reliably
// greppable for literal text).
function buildPackingSlipFields(order) {
  if (!hasShippingAddress(order)) return null;

  return {
    orderNumber: order.order_number,
    address: addressLines(order),
    productName: order.product_name,
    quantity: 1,
  };
}

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function buildInvoicePdf(order) {
  const fields = buildInvoiceFields(order);
  if (!fields) return null;

  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Invoice', { align: 'left' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Order: ${fields.orderNumber}`);
  doc.text(`Date: ${new Date(fields.date).toLocaleDateString('en-US')}`);
  doc.moveDown();
  doc.text('Ship to:');
  fields.address.forEach((line) => doc.text(line));
  doc.moveDown();
  doc.text(`Product: ${fields.productName}`);
  doc.moveDown();
  doc.text(`Unit price: ${fields.unitPrice}`);
  doc.text(`Delivery: ${fields.delivery}`);
  doc.text(`VAT: ${fields.vat}`);
  if (fields.voucher) {
    doc.text(`Voucher${fields.voucher.code ? ` (${fields.voucher.code})` : ''}: -${fields.voucher.amount}`);
  }
  doc.moveDown();
  doc.fontSize(13).text(`Total: ${fields.total}`, { underline: true });

  return streamToBuffer(doc);
}

async function buildPackingSlipPdf(order) {
  const fields = buildPackingSlipFields(order);
  if (!fields) return null;

  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Packing Slip', { align: 'left' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Order: ${fields.orderNumber}`);
  doc.moveDown();
  doc.text('Ship to:');
  fields.address.forEach((line) => doc.text(line));
  doc.moveDown();
  doc.text(`Product: ${fields.productName}`);
  doc.text(`Quantity: ${fields.quantity}`);

  return streamToBuffer(doc);
}

module.exports = { buildInvoiceFields, buildPackingSlipFields, buildInvoicePdf, buildPackingSlipPdf };
```

- [ ] **Step 6: Run to verify tests pass**

Run: `node --test test/pdfService.test.js`
Expected: PASS (12 tests)

- [ ] **Step 7: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/utils/pricing.js src/services/pdfService.js test/pdfService.test.js package.json package-lock.json
git commit -m "Add PDF invoice and packing-slip generation"
```

---

### Task 3: Shipping-update service + email

**Files:**
- Modify: `src/services/adminOrderService.js:75-80` (add `updateOrderShipping` to the exports)
- Modify: `src/services/emailService.js:49` (add `sendShippingUpdateEmail` to the exports)
- Test: `test/adminOrderService.test.js` (append)
- Test: `test/emailService.test.js` (append)

**Interfaces:**
- Consumes: `pool`, `orderCache` (existing, `adminOrderService.js`'s current imports); `nodemailer`, `logError`, `isConfigured`, `getTransporter` (existing, `emailService.js`'s current internals).
- Produces: `adminOrderService.updateOrderShipping(orderNumber, { carrier, trackingNumber })` → `Promise<order|null>`, invalidates `orderCache` on success (same pattern as `updateOrderStatus`). `emailService.sendShippingUpdateEmail(email, order)` → `Promise<boolean>` (whether it actually sent) — consumed directly by Task 4's controller.

- [ ] **Step 1: Write the failing tests for `updateOrderShipping`**

```js
// append to test/adminOrderService.test.js

test('updateOrderShipping runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET carrier = \$1, tracking_number = \$2 WHERE order_number = \$3/);
    assert.deepEqual(params, ['UPS', '1Z999AA10123456784', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }] };
  });

  const order = await adminOrderService.updateOrderShipping('ORD-1001', {
    carrier: 'UPS',
    trackingNumber: '1Z999AA10123456784',
  });
  assert.equal(order.carrier, 'UPS');
});

test('updateOrderShipping returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderShipping('NOPE', { carrier: 'UPS', trackingNumber: '123' });
  assert.equal(order, null);
});

test('updateOrderShipping invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', carrier: null, tracking_number: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }],
  }));

  await adminOrderService.updateOrderShipping('ORD-1001', { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });

  assert.equal(orderCache.has('order:ORD-1001'), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/adminOrderService.test.js`
Expected: FAIL — `adminOrderService.updateOrderShipping is not a function`

- [ ] **Step 3: Implement `updateOrderShipping`**

Add to `src/services/adminOrderService.js`, above `module.exports`:

```js
// The second write path through this file - same cache-invalidation
// reasoning updateOrderStatus already established (see its own comment
// above): getOrderByNumber and the chat tool both read through the same
// `order:${orderNumber}` cache key, so a carrier/tracking change needs
// the identical treatment.
async function updateOrderShipping(orderNumber, { carrier, trackingNumber }) {
  const { rows } = await pool.query(
    'UPDATE orders SET carrier = $1, tracking_number = $2 WHERE order_number = $3 RETURNING *',
    [carrier, trackingNumber, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) {
    orderCache.delete(`order:${orderNumber}`);
  }
  return order;
}
```

Update `module.exports`:

```js
module.exports = {
  ORDER_STATUSES,
  InvalidCursorError,
  getAdminOrders,
  updateOrderStatus,
  updateOrderShipping,
};
```

- [ ] **Step 4: Run to verify the `updateOrderShipping` tests pass**

Run: `node --test test/adminOrderService.test.js`
Expected: PASS (14 tests total)

- [ ] **Step 5: Write the failing tests for `sendShippingUpdateEmail`**

```js
// append to test/emailService.test.js

test('sendShippingUpdateEmail returns false without attempting to send when not configured', async () => {
  const { sendShippingUpdateEmail } = require('../src/services/emailService');
  const sent = await sendShippingUpdateEmail('jane@example.com', {
    order_number: 'ORD-1001',
    product_name: 'Wireless Headphones',
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
  });
  assert.equal(sent, false);
});

test('sendShippingUpdateEmail sends with the right recipient and subject when configured', async (t) => {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
  process.env.EMAIL_FROM = 'noreply@example.com';

  const sendMail = t.mock.fn(async () => {});
  const nodemailer = require('nodemailer');
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail }));

  const { sendShippingUpdateEmail } = require('../src/services/emailService');
  const sent = await sendShippingUpdateEmail('jane@example.com', {
    order_number: 'ORD-1001',
    product_name: 'Wireless Headphones',
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
  });

  assert.equal(sent, true);
  assert.equal(sendMail.mock.callCount(), 1);
  const args = sendMail.mock.calls[0].arguments[0];
  assert.equal(args.to, 'jane@example.com');
  assert.match(args.subject, /ORD-1001/);
  assert.match(args.text, /1Z999AA10123456784/);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test test/emailService.test.js`
Expected: FAIL — `sendShippingUpdateEmail is not a function`

- [ ] **Step 7: Implement `sendShippingUpdateEmail`**

Add to `src/services/emailService.js`, above `module.exports`:

```js
async function sendShippingUpdateEmail(email, order) {
  if (!isConfigured()) return false;

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Your order ${order.order_number} has shipped`,
      text: `Good news! Your order ${order.order_number} (${order.product_name}) has shipped via ${order.carrier}. Tracking number: ${order.tracking_number}.`,
      html: `<p>Good news! Your order <strong>${order.order_number}</strong> (${order.product_name}) has shipped via ${order.carrier}.</p><p>Tracking number: <strong>${order.tracking_number}</strong></p>`,
    });
    return true;
  } catch (err) {
    logError('Failed to send shipping update email', err);
    return false;
  }
}
```

Update `module.exports`:

```js
module.exports = { sendOtpEmail, sendShippingUpdateEmail, isConfigured };
```

- [ ] **Step 8: Run to verify the `sendShippingUpdateEmail` tests pass**

Run: `node --test test/emailService.test.js`
Expected: PASS (6 tests total)

- [ ] **Step 9: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 10: Commit**

```bash
git add src/services/adminOrderService.js src/services/emailService.js test/adminOrderService.test.js test/emailService.test.js
git commit -m "Add updateOrderShipping and sendShippingUpdateEmail"
```

---

### Task 4: HTTP layer — controller handlers + routes

**Files:**
- Modify: `src/controllers/adminOrderController.js:1-82` (add three handlers + their imports)
- Modify: `src/routes/adminOrderRoutes.js` (add three routes)
- Test: `test/adminOrderShipping.test.js`

**Interfaces:**
- Consumes: `pdfService.buildInvoicePdf`, `pdfService.buildPackingSlipPdf` (Task 2); `adminOrderService.updateOrderShipping` (Task 3); `emailService.sendShippingUpdateEmail` (Task 3); `orderService.getOrderByNumber`, `auditLog`, `logError` (all existing, already imported in `adminOrderController.js`).
- Produces: `GET /api/admin/orders/:orderNumber/invoice.pdf`, `GET /api/admin/orders/:orderNumber/packing-slip.pdf`, `PATCH /api/admin/orders/:orderNumber/shipping` — all mounted under the existing `/api/admin/orders` router, already gated by `requireAdminAuth` at the router level in `src/app.js`. The `PATCH` response body is the updated order object plus an `emailed: boolean` field — Task 5's frontend reads `data.emailed` to pick its confirmation copy.

- [ ] **Step 1: Write the failing route-level tests**

```js
// test/adminOrderShipping.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

test.beforeEach(() => orderCache.clear());

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

const ORDER_WITH_ADDRESS = {
  order_number: 'ORD-1001',
  customer_email: 'jane.doe@example.com',
  product_name: 'Wireless Headphones',
  created_at: '2026-07-24T00:00:00Z',
  carrier: null,
  tracking_number: null,
  unit_price_cents: 40000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
  voucher_code: null,
  recipient_name: 'Jane Doe',
  address_line1: '482 Maple Street',
  address_line2: null,
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  country: 'US',
};

test('GET /api/admin/orders/:orderNumber/invoice.pdf requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns a PDF for an order with an address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [ORDER_WITH_ADDRESS] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 404);
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns 409 when there is no shipping address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...ORDER_WITH_ADDRESS, address_line1: null }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 409);
  });
});

test('GET /api/admin/orders/:orderNumber/packing-slip.pdf returns a PDF for an order with an address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [ORDER_WITH_ADDRESS] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/packing-slip.pdf`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '123' }),
    });
    assert.equal(res.status, 401);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping updates carrier and tracking number', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE orders/.test(sql)) {
      return { rows: [{ ...ORDER_WITH_ADDRESS, carrier: 'UPS', tracking_number: '1Z999AA10123456784' }] };
    }
    return { rows: [ORDER_WITH_ADDRESS] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.carrier, 'UPS');
    // No SMTP_* configured in the test environment (see package.json's
    // test script), so isConfigured() is false and sendShippingUpdateEmail
    // always returns false here - this is the real, honest behavior in
    // this environment, not a value that needs mocking.
    assert.equal(body.emailed, false);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping rejects a missing carrier with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ trackingNumber: '123' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '123' }),
    });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/adminOrderShipping.test.js`
Expected: FAIL — the new routes don't exist yet (404s where 200/409/400 are expected, or connection succeeds but wrong status).

- [ ] **Step 3: Add the imports and three handlers to `src/controllers/adminOrderController.js`**

Add these two `require`s near the top of the file, alongside the existing ones:

```js
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
```

Add these three functions, above `module.exports`:

```js
async function getInvoicePdf(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const pdf = await pdfService.buildInvoicePdf(order);
    if (!pdf) {
      return res.status(409).json({ error: 'This order has no shipping address or pricing data on file yet.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logError('Admin invoice PDF error', err);
    res.status(500).json({ error: 'Something went wrong generating that invoice.' });
  }
}

async function getPackingSlipPdf(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const pdf = await pdfService.buildPackingSlipPdf(order);
    if (!pdf) {
      return res.status(409).json({ error: 'This order has no shipping address on file yet.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="packing-slip-${order.order_number}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logError('Admin packing slip PDF error', err);
    res.status(500).json({ error: 'Something went wrong generating that packing slip.' });
  }
}

async function updateShipping(req, res) {
  const { carrier, trackingNumber } = req.body;
  if (!carrier || !trackingNumber) {
    return res.status(400).json({ error: 'carrier and trackingNumber are required.' });
  }

  try {
    const previous = await orderService.getOrderByNumber(req.params.orderNumber);
    const updated = await adminOrderService.updateOrderShipping(req.params.orderNumber, { carrier, trackingNumber });
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // A no-op re-save (admin clicks Save without changing anything) must
    // not re-notify the customer.
    const changed = !previous || previous.carrier !== carrier || previous.tracking_number !== trackingNumber;
    let emailed = false;
    if (changed) {
      emailed = await emailService.sendShippingUpdateEmail(updated.customer_email, updated);
    }

    auditLog('admin.order.shipping_updated', {
      orderNumber: req.params.orderNumber,
      carrier,
      trackingNumber,
      emailed,
      admin: req.adminEmail,
    });
    res.json({ ...updated, emailed });
  } catch (err) {
    logError('Admin order shipping update error', err);
    res.status(500).json({ error: 'Something went wrong updating shipping info.' });
  }
}
```

Update `module.exports`:

```js
module.exports = { listOrders, getOrder, updateStatus, getInvoicePdf, getPackingSlipPdf, updateShipping };
```

- [ ] **Step 4: Add the three routes to `src/routes/adminOrderRoutes.js`**

```js
const { Router } = require('express');
const {
  listOrders,
  getOrder,
  updateStatus,
  getInvoicePdf,
  getPackingSlipPdf,
  updateShipping,
} = require('../controllers/adminOrderController');

const router = Router();

router.get('/', listOrders);
router.get('/:orderNumber', getOrder);
router.patch('/:orderNumber/status', updateStatus);
router.get('/:orderNumber/invoice.pdf', getInvoicePdf);
router.get('/:orderNumber/packing-slip.pdf', getPackingSlipPdf);
router.patch('/:orderNumber/shipping', updateShipping);

module.exports = router;
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `node --test test/adminOrderShipping.test.js`
Expected: PASS (9 tests)

- [ ] **Step 6: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add src/controllers/adminOrderController.js src/routes/adminOrderRoutes.js test/adminOrderShipping.test.js
git commit -m "Add invoice/packing-slip PDF routes and shipping-update endpoint"
```

---

### Task 5: Frontend — extend `AdminOrderDetailPage.jsx`, manual verification

**Files:**
- Modify: `frontend/src/pages/AdminOrderDetailPage.jsx:1-151` (full current content shown below for exact context)
- Modify: `frontend/src/pages/AdminOrderDetailPage.test.jsx` (append)
- Modify: `frontend/src/index.css` (append shipping-section styles)

**Interfaces:**
- Consumes: `PATCH /api/admin/orders/:orderNumber/shipping` (Task 4, returns the updated order plus `emailed: boolean`); `GET /api/admin/orders/:orderNumber/invoice.pdf` and `.../packing-slip.pdf` (Task 4, plain download links, no fetch needed).
- Produces: no new exports — this is a page-level UI addition only.

For reference, the current full file (`frontend/src/pages/AdminOrderDetailPage.jsx`) is:

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const STATUS_OPTIONS = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function AdminOrderDetailPage() {
  const { logout } = useAdminAuth();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOrder(null);
    fetch(`/api/admin/orders/${orderNumber}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that order.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data);
        setSelectedStatus(data.status);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  async function saveStatus() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating that order.');
      }
      const updated = await res.json();
      setOrder(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !order) {
    return (
      <div className="admin-order-detail-page">
        <p className="verify-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!order) return null;

  const total = computeOrderTotal(order);

  return (
    <div className="admin-order-detail-page">
      <h1>{order.order_number}</h1>

      <div className="admin-order-detail-field">
        <span>Customer</span>
        <span>{order.customer_email}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Product</span>
        <span>{order.product_name}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Ordered</span>
        <span>{dateFormatter.format(new Date(order.created_at))}</span>
      </div>
      {order.carrier && (
        <div className="admin-order-detail-field">
          <span>Carrier</span>
          <span>{order.carrier}</span>
        </div>
      )}
      {order.tracking_number && (
        <div className="admin-order-detail-field">
          <span>Tracking #</span>
          <span>{order.tracking_number}</span>
        </div>
      )}
      {total !== null && (
        <div className="admin-order-detail-field">
          <span>Total paid</span>
          <span>{formatCents(total)}</span>
        </div>
      )}

      <div className="admin-order-detail-status">
        <label htmlFor="admin-order-status-select">Change status</label>
        <select
          id="admin-order-status-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" onClick={saveStatus} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {saved && <p className="admin-order-detail-saved">Status updated.</p>}
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/pages/AdminOrderDetailPage.test.jsx` (the existing file already defines `ORDER`, `renderPage()`, and a `beforeEach` mocking `global.fetch` — extend that `ORDER` constant and the `beforeEach` fetch mock as shown, then add these tests):

```jsx
// Extend the existing ORDER constant at the top of the file with shipping-
// address fields (the existing fields - order_number, customer_email,
// product_name, status, carrier, tracking_number, created_at,
// unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents - stay
// exactly as they are):
//
//   recipient_name: 'Jane Doe',
//   address_line1: '482 Maple Street',
//   address_line2: null,
//   city: 'Austin',
//   state: 'TX',
//   postal_code: '78701',
//   country: 'US',

it('renders the shipping address when present', async () => {
  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByText('482 Maple Street')).toBeInTheDocument();
  expect(screen.getByText(/Austin, TX 78701/)).toBeInTheDocument();
});

it('shows "No shipping address on file" and hides downloads when there is none', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ({ ...ORDER, address_line1: null }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByText(/no shipping address on file/i)).toBeInTheDocument();
  expect(screen.queryByText(/download invoice/i)).not.toBeInTheDocument();
});

it('shows the invoice and packing-slip download links pointing at the right URLs when an address exists', async () => {
  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByRole('link', { name: /download invoice/i })).toHaveAttribute(
    'href',
    '/api/admin/orders/ORD-1001/invoice.pdf'
  );
  expect(screen.getByRole('link', { name: /download packing slip/i })).toHaveAttribute(
    'href',
    '/api/admin/orders/ORD-1001/packing-slip.pdf'
  );
});

it('updates shipping info and shows the emailed confirmation when the response says emailed:true', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/shipping' && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, carrier: 'UPS', tracking_number: '1Z999', emailed: true }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/^carrier$/i), { target: { value: 'UPS' } });
  fireEvent.change(screen.getByLabelText(/tracking #/i), { target: { value: '1Z999' } });
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/orders/ORD-1001/shipping',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999' }) })
    );
  });
  expect(await screen.findByText(/updated and customer notified/i)).toBeInTheDocument();
});

it('shows the plain confirmation when the response says emailed:false', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/shipping' && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, carrier: 'UPS', tracking_number: '1Z999', emailed: false }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/^carrier$/i), { target: { value: 'UPS' } });
  fireEvent.change(screen.getByLabelText(/tracking #/i), { target: { value: '1Z999' } });
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  const confirmation = await screen.findByText(/shipping info updated/i);
  expect(confirmation).not.toHaveTextContent(/notified/i);
});

it('surfaces an error when the shipping update fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (opts?.method === 'PATCH' && url.endsWith('/shipping')) {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'carrier and trackingNumber are required.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  expect(await screen.findByRole('alert')).toHaveTextContent(/carrier and trackingnumber are required/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminOrderDetailPage`
Expected: FAIL — the shipping section, its inputs, and the download links don't exist yet.

- [ ] **Step 3: Extend `AdminOrderDetailPage.jsx`**

Replace the full file with:

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const STATUS_OPTIONS = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function AdminOrderDetailPage() {
  const { logout } = useAdminAuth();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [carrierInput, setCarrierInput] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);
  const [shippingEmailed, setShippingEmailed] = useState(false);
  const [shippingError, setShippingError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOrder(null);
    fetch(`/api/admin/orders/${orderNumber}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that order.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data);
        setSelectedStatus(data.status);
        setCarrierInput(data.carrier || '');
        setTrackingInput(data.tracking_number || '');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  async function saveStatus() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating that order.');
      }
      const updated = await res.json();
      setOrder(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveShipping() {
    setShippingSaving(true);
    setShippingSaved(false);
    setShippingError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierInput, trackingNumber: trackingInput }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating shipping info.');
      }
      const updated = await res.json();
      setOrder(updated);
      setShippingEmailed(Boolean(updated.emailed));
      setShippingSaved(true);
    } catch (err) {
      setShippingError(err.message);
    } finally {
      setShippingSaving(false);
    }
  }

  if (error && !order) {
    return (
      <div className="admin-order-detail-page">
        <p className="verify-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!order) return null;

  const total = computeOrderTotal(order);
  const hasAddress = Boolean(order.address_line1);

  return (
    <div className="admin-order-detail-page">
      <h1>{order.order_number}</h1>

      <div className="admin-order-detail-field">
        <span>Customer</span>
        <span>{order.customer_email}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Product</span>
        <span>{order.product_name}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Ordered</span>
        <span>{dateFormatter.format(new Date(order.created_at))}</span>
      </div>
      {order.carrier && (
        <div className="admin-order-detail-field">
          <span>Carrier</span>
          <span>{order.carrier}</span>
        </div>
      )}
      {order.tracking_number && (
        <div className="admin-order-detail-field">
          <span>Tracking #</span>
          <span>{order.tracking_number}</span>
        </div>
      )}
      {total !== null && (
        <div className="admin-order-detail-field">
          <span>Total paid</span>
          <span>{formatCents(total)}</span>
        </div>
      )}

      <div className="admin-order-detail-status">
        <label htmlFor="admin-order-status-select">Change status</label>
        <select
          id="admin-order-status-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" onClick={saveStatus} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {saved && <p className="admin-order-detail-saved">Status updated.</p>}
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-order-detail-shipping">
        <h2>Shipping</h2>

        {hasAddress ? (
          <div className="admin-order-detail-address">
            <span>{order.recipient_name}</span>
            <span>{order.address_line1}</span>
            {order.address_line2 && <span>{order.address_line2}</span>}
            <span>
              {order.city}, {order.state} {order.postal_code}
            </span>
            <span>{order.country}</span>
          </div>
        ) : (
          <p className="subtitle">No shipping address on file.</p>
        )}

        <label htmlFor="admin-order-carrier-input">Carrier</label>
        <input
          id="admin-order-carrier-input"
          type="text"
          value={carrierInput}
          onChange={(e) => setCarrierInput(e.target.value)}
        />
        <label htmlFor="admin-order-tracking-input">Tracking #</label>
        <input
          id="admin-order-tracking-input"
          type="text"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
        />
        <button type="button" onClick={saveShipping} disabled={shippingSaving}>
          {shippingSaving ? 'Saving...' : 'Save'}
        </button>

        {shippingSaved && (
          <p className="admin-order-detail-saved">
            {shippingEmailed ? 'Shipping info updated and customer notified.' : 'Shipping info updated.'}
          </p>
        )}
        {shippingError && (
          <p className="verify-error" role="alert">
            {shippingError}
          </p>
        )}

        {hasAddress ? (
          <div className="admin-order-detail-downloads">
            <a href={`/api/admin/orders/${orderNumber}/invoice.pdf`}>Download Invoice</a>
            <a href={`/api/admin/orders/${orderNumber}/packing-slip.pdf`}>Download Packing Slip</a>
          </div>
        ) : (
          <p className="subtitle">Downloads unavailable until this order has a shipping address.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminOrderDetailPage`
Expected: PASS (12 tests)

- [ ] **Step 5: Add shipping-section styles to `frontend/src/index.css`**

Append after the existing `.admin-order-detail-saved` rule:

```css
.admin-order-detail-shipping {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.admin-order-detail-shipping h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-base);
}

.admin-order-detail-address {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.admin-order-detail-shipping label {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
}

.admin-order-detail-shipping input {
  display: block;
  width: 100%;
  max-width: 320px;
  padding: 0.5rem 0.75rem;
  margin-top: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-order-detail-shipping button {
  margin-top: var(--space-3);
}

.admin-order-detail-downloads {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 7: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Manual verification in the browser**

Start both servers if not already running (`npm run dev` for the backend, `npm --prefix frontend run dev` for the frontend), sign in at `/admin/login`, navigate to any order's detail page, and confirm:
- The shipping address (from Task 1's backfill) renders correctly for every seeded customer.
- Entering a carrier + tracking number and clicking Save updates the order, shows the right confirmation copy (with SMTP unconfigured locally, expect "Shipping info updated." — not the "and customer notified" variant, matching Task 4's real, honest `emailed: false` behavior in this environment).
- "Download Invoice" and "Download Packing Slip" both download real, openable PDFs with the right content (open each and visually confirm: the invoice shows pricing, the packing slip does not).
- An order manually edited (via a direct DB query, if you want to test the gap) to have no `address_line1` shows "No shipping address on file" and hides both downloads instead of linking to a `409`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/AdminOrderDetailPage.jsx frontend/src/pages/AdminOrderDetailPage.test.jsx frontend/src/index.css
git commit -m "Add shipping-update form and PDF download links to AdminOrderDetailPage"
```

---

## Post-Plan Notes (not part of this plan's scope)

- `CheckoutPage.jsx` remains untouched and still has no real backend — a real cart/checkout/order-creation pipeline is a separate, much larger future project.
- Editing or adding a shipping address where none exists is not built — every real order already has one via Task 1's backfill.
- A real carrier-specific shipping-label file format (ZPL, carrier-API-generated label PDF) was not built — the roadmap's "shipping label" wording, on inspection, meant tracking-number entry + customer notification, which is what this plan builds.
- The remaining Phase 2 sub-projects (Product Variants & Inventory Guard, Customer Database (CRM)) remain separate, not-yet-brainstormed future work.
