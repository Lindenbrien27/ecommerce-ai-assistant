# Return & Refund (RMA) Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin process a full or partial refund against an order and, optionally, restore the returned item to stock — the third and final Phase 3 sub-project.

**Architecture:** Extends the existing admin order-manager code (`adminOrderService.js`/`adminOrderController.js`/`adminOrderRoutes.js`) with one new action, rather than a new resource triad. Adds four columns to `orders` and widens its `status` CHECK constraint to include `'returned'` — a value that already has full customer-facing styling (`OrdersPage.jsx`'s `HISTORY_BADGE` map) but was never assignable to a real order until now. Full design rationale: `docs/superpowers/specs/2026-08-16-rma-refunds-design.md`.

**Tech Stack:** Express + `pg` (`pool.query`), `node-pg-migrate`, React (no new dependencies), `node:test`, Vitest + Testing Library.

## Global Constraints

- `'returned'` is added to the **database** `status` CHECK constraint, but deliberately **NOT** to `adminOrderService.js`'s `ORDER_STATUSES` constant. `ORDER_STATUSES` gates two things that must keep behaving exactly as they do today: the generic `PATCH /:orderNumber/status` endpoint (the plain status dropdown on `AdminOrderDetailPage.jsx`) and `getAdminOrders`'s status-filter validation. `'returned'` must only be reachable through the new dedicated refund endpoint, which sets it directly via its own SQL — not through the generic status-change dropdown, so an admin can't flip an order to "returned" without going through the money/stock-aware refund flow. A returned order still appears in the unfiltered Orders list and shows the correct badge; filtering the list specifically by `status=returned` is out of scope this pass (documented below, not an oversight).
- At most one refund per order — `refunded_at IS NOT NULL` means already refunded, a second attempt is `409`.
- Refund amount and stock restoration are independent, admin-controlled inputs — never one derived from the other.
- Restocking matches `orders.product_name = products.name`; if no row matches (renamed/deleted product since the order was placed), the refund still succeeds financially and `restocked` comes back `false` in the response — never an error, never silently `true`.
- Refund amount is capped server-side at the order's real total (`unit_price_cents + delivery_cost_cents + vat_cents - voucher_cents`, computed inline — this codebase has no shared frontend/backend module, every service inlines this formula).
- Same cache-invalidation (`order:${orderNumber}` + that customer's `list:${email}:*` entries) that `updateOrderStatus`/`updateOrderShipping` already perform — the refund endpoint changes `status` too, so it needs the identical treatment.
- No new table, no email notification on refund (out of scope, a natural follow-up), no multi-refund accumulation per order, no `CheckoutPage.jsx` changes.

---

## Task 1: Backend — `POST /api/admin/orders/:orderNumber/refund`

**Files:**
- Create: `migrations/1786928000000_add-order-refund-fields.sql`
- Modify: `src/services/adminOrderService.js`
- Modify: `src/controllers/adminOrderController.js`
- Modify: `src/routes/adminOrderRoutes.js`
- Test: `test/adminOrderService.test.js`
- Test: `test/adminOrders.test.js`

**Interfaces:**
- Produces: `refundOrder(orderNumber, { amountCents, restock, reason })` → `Promise<object|null>` (the updated order row, or `null` if the order doesn't exist), throws `ValidationError` (bad/over-limit amount) or `ConflictError` (already refunded). Mounted at `POST /api/admin/orders/:orderNumber/refund`, admin-auth-gated. Task 2's frontend depends on this exact request/response shape.

- [ ] **Step 1: Create the migration `migrations/1786928000000_add-order-refund-fields.sql`**

```sql
-- Up Migration

-- refund_amount_cents/refund_reason/restocked/refunded_at are all NULL
-- (restocked defaults false) until a refund is actually processed -
-- refunded_at IS NOT NULL is what "this order has already been refunded"
-- means (see adminOrderService.js's refundOrder). 'returned' joins the
-- status CHECK constraint here at the database level - it's deliberately
-- NOT added to adminOrderService.js's own ORDER_STATUSES allowlist (see
-- that file's own comment), so it's only reachable through the refund
-- endpoint, never the generic status-PATCH dropdown.
ALTER TABLE orders
  ADD COLUMN refund_amount_cents INTEGER,
  ADD COLUMN refund_reason TEXT,
  ADD COLUMN restocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN refunded_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'));

-- Down Migration

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'));

ALTER TABLE orders
  DROP COLUMN refund_amount_cents,
  DROP COLUMN refund_reason,
  DROP COLUMN restocked,
  DROP COLUMN refunded_at;
```

- [ ] **Step 2: Write the failing tests in `test/adminOrderService.test.js`**

Append these tests to the end of the existing file (every existing test in that file — `getAdminOrders`/`updateOrderStatus`/`updateOrderShipping` — is untouched):

```javascript
const EXISTING_ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  status: 'delivered',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
  refunded_at: null,
};

test('refundOrder returns null for an unknown order number', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const result = await adminOrderService.refundOrder('NOPE', { amountCents: 100, restock: false, reason: null });
  assert.equal(result, null);
});

test('refundOrder rejects a second refund on an already-refunded order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ ...EXISTING_ORDER, refunded_at: '2026-01-01T00:00:00Z' }],
  }));

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 100, restock: false, reason: null }),
    adminOrderService.ConflictError
  );
});

test('refundOrder rejects an amount that exceeds the order total', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [] };
  });

  // total = 5000 + 500 + 0 - 0 = 5500
  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5501, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder rejects a non-positive amount', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [] };
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 0, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder restocks when the product name still matches a live row', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    if (/^UPDATE products/.test(sql.trim())) {
      assert.match(sql, /stock_quantity = stock_quantity \+ 1/);
      assert.deepEqual(params, ['Sneakers']);
      return { rows: [{ slug: 'sneakers' }] };
    }
    if (/^UPDATE orders/.test(sql.trim())) {
      assert.match(sql, /status = 'returned'/);
      return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 5500, restocked: true, refunded_at: '2026-01-02T00:00:00Z' }] };
    }
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: 'Item damaged' });
  assert.equal(updated.status, 'returned');
  assert.equal(updated.restocked, true);
  assert.equal(query.mock.callCount(), 3);
});

test('refundOrder reports restocked:false without erroring when the product name matches nothing', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    if (/^UPDATE products/.test(sql.trim())) return { rows: [] }; // no matching product - renamed/deleted
    if (/^UPDATE orders/.test(sql.trim())) {
      return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 5500, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
    }
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });
  assert.equal(updated.restocked, false);
});

test('refundOrder does not attempt to restock when restock is false', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    assert.doesNotMatch(sql, /UPDATE products/);
    return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 2000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
  });

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });
  assert.equal(query.mock.callCount(), 2); // SELECT + the orders UPDATE only, no products UPDATE
});

test('refundOrder invalidates the order cache and that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'delivered' });
  orderCache.set('list:jane@example.com:20:', { orders: [], nextCursor: null });
  orderCache.set('list:someone.else@example.com:20:', { orders: [], nextCursor: null });

  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [{ ...EXISTING_ORDER, status: 'returned', customer_email: 'jane@example.com', refund_amount_cents: 2000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
  });

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });

  assert.equal(orderCache.has('order:ORD-1001'), false);
  assert.equal(orderCache.has('list:jane@example.com:20:'), false);
  assert.equal(orderCache.has('list:someone.else@example.com:20:'), true);
});
```

The `EXISTING_ORDER` fixture and these tests need `orderCache` in scope — the file already imports it (`const { orderCache } = require('../src/config/cache');`) for the pre-existing `updateOrderStatus`/`updateOrderShipping` cache tests, so no new import is needed.

- [ ] **Step 3: Run the test file to confirm it fails**

Run: `node --test test/adminOrderService.test.js`
Expected: FAIL — `adminOrderService.refundOrder` doesn't exist yet.

- [ ] **Step 4: Add `refundOrder` to `src/services/adminOrderService.js`**

Add these two error classes near the top of the file, right after the `ORDER_STATUSES` constant:

```javascript
class ValidationError extends Error {}
class ConflictError extends Error {}
```

Add this function anywhere in the file (e.g. right after `updateOrderShipping`, before `module.exports`):

```javascript
// Refund amount and stock restoration are independent, admin-controlled
// inputs (see this plan's own Global Constraints) - a partial refund
// doesn't imply the item came back, and restocking never happens without
// the admin explicitly asking for it. 'returned' is set directly here,
// not through updateOrderStatus/ORDER_STATUSES - that allowlist
// deliberately excludes it, so this is the only path that can set it.
async function refundOrder(orderNumber, { amountCents, restock, reason }) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  const order = rows[0];
  if (!order) return null;

  if (order.refunded_at) {
    throw new ConflictError('This order has already been refunded.');
  }

  const totalPaidCents =
    (order.unit_price_cents || 0) + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0);

  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > totalPaidCents) {
    throw new ValidationError(`amount_cents must be a positive integer no greater than ${totalPaidCents}.`);
  }

  // Products aren't linked to orders by a foreign key (see this plan's
  // own Global Constraints) - matches by name, and simply reports false
  // rather than erroring if nothing matches (the product may have been
  // renamed or deleted since this order was placed).
  let restocked = false;
  if (restock) {
    const restockResult = await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity + 1 WHERE name = $1 RETURNING slug',
      [order.product_name]
    );
    restocked = restockResult.rows.length > 0;
  }

  const { rows: updatedRows } = await pool.query(
    `UPDATE orders SET status = 'returned', refund_amount_cents = $1, refund_reason = $2, restocked = $3, refunded_at = now()
     WHERE order_number = $4
     RETURNING *`,
    [amountCents, reason ?? null, restocked, orderNumber]
  );
  const updated = updatedRows[0];

  // Same cache-invalidation reasoning updateOrderStatus/updateOrderShipping
  // already document - this write changes status too, so it needs the
  // identical treatment.
  orderCache.delete(`order:${orderNumber}`);
  for (const key of orderCache.keys()) {
    if (key.startsWith(`list:${updated.customer_email}:`)) {
      orderCache.delete(key);
    }
  }

  return updated;
}
```

Update `module.exports` to add the new exports:

```javascript
module.exports = {
  ORDER_STATUSES,
  ValidationError,
  ConflictError,
  getAdminOrders,
  updateOrderStatus,
  updateOrderShipping,
  refundOrder,
};
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `node --test test/adminOrderService.test.js`
Expected: PASS, all tests including the untouched `getAdminOrders`/`updateOrderStatus`/`updateOrderShipping` ones.

- [ ] **Step 6: Write the failing tests in `test/adminOrders.test.js`**

Append these tests to the end of the existing file:

```javascript
test('POST /api/admin/orders/:orderNumber/refund requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 409 for an already-refunded order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: '2026-01-01T00:00:00Z' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 409);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 400 for an amount over the order total', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: null }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 999999, restock: false }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/admin/orders/:orderNumber/refund succeeds with a full round-trip response', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) {
      return { rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: null }] };
    }
    if (/^UPDATE orders/.test(sql.trim())) {
      return { rows: [{ order_number: 'ORD-1001', status: 'returned', refund_amount_cents: 5000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
    }
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 5000, restock: false, reason: 'Wrong size' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'returned');
    assert.equal(body.refund_amount_cents, 5000);
  });
});
```

- [ ] **Step 7: Run the test file to confirm it fails**

Run: `node --test test/adminOrders.test.js`
Expected: FAIL — no route exists yet (404s instead of the expected 401/404/409/400/200).

- [ ] **Step 8: Add `refundOrder` to `src/controllers/adminOrderController.js`**

Add this function anywhere in the file (e.g. right after `updateShipping`, before `module.exports`):

```javascript
async function refundOrder(req, res) {
  const { amount_cents: amountCents, restock, reason } = req.body;
  try {
    const updated = await adminOrderService.refundOrder(req.params.orderNumber, {
      amountCents,
      restock: Boolean(restock),
      reason: reason || null,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }
    auditLog('admin.order.refunded', {
      orderNumber: req.params.orderNumber,
      amountCents,
      restock: Boolean(restock),
      admin: req.adminEmail,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof adminOrderService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminOrderService.ConflictError) {
      return res.status(409).json({ error: err.message });
    }
    logError('Admin order refund error', err);
    res.status(500).json({ error: 'Something went wrong processing that refund.' });
  }
}
```

Update `module.exports`:

```javascript
module.exports = { listOrders, getOrder, updateStatus, getInvoicePdf, getPackingSlipPdf, updateShipping, refundOrder };
```

- [ ] **Step 9: Wire the route in `src/routes/adminOrderRoutes.js`**

Find:

```javascript
const {
  listOrders,
  getOrder,
  updateStatus,
  getInvoicePdf,
  getPackingSlipPdf,
  updateShipping,
} = require('../controllers/adminOrderController');
```

Replace with:

```javascript
const {
  listOrders,
  getOrder,
  updateStatus,
  getInvoicePdf,
  getPackingSlipPdf,
  updateShipping,
  refundOrder,
} = require('../controllers/adminOrderController');
```

Find:

```javascript
router.patch('/:orderNumber/shipping', updateShipping);
```

Add immediately after it:

```javascript
router.post('/:orderNumber/refund', refundOrder);
```

- [ ] **Step 10: Run the test file to confirm it passes**

Run: `node --test test/adminOrders.test.js`
Expected: PASS, all tests.

- [ ] **Step 11: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 12: Commit**

```bash
git add migrations/1786928000000_add-order-refund-fields.sql src/services/adminOrderService.js src/controllers/adminOrderController.js src/routes/adminOrderRoutes.js test/adminOrderService.test.js test/adminOrders.test.js
git commit -m "Add refund processing: order refund fields, restock-on-name-match, and the refund endpoint"
```

---

## Task 2: Frontend — Refund section on `AdminOrderDetailPage`

**Files:**
- Modify: `frontend/src/pages/AdminOrderDetailPage.jsx`
- Modify: `frontend/src/pages/AdminOrderDetailPage.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `POST /api/admin/orders/:orderNumber/refund` → the updated order (Task 1), including `refund_amount_cents`, `refund_reason`, `restocked`, `refunded_at`.
- Produces: nothing consumed by other tasks — leaf page change.

- [ ] **Step 1: Add the new tests to `frontend/src/pages/AdminOrderDetailPage.test.jsx`**

Append these tests to the end of the existing file (every existing test in that file is untouched):

```jsx
it('shows the refund form pre-filled with the order total when not yet refunded', async () => {
  renderPage();
  await screen.findByText('Sneakers');
  // ORDER fixture: unit_price_cents 5000 + delivery_cost_cents 500 = 5500
  expect(screen.getByLabelText(/refund amount/i)).toHaveValue(55);
});

it('submits a refund with the entered amount and restock choice', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/refund' && opts?.method === 'POST') {
      const body = JSON.parse(opts.body);
      expect(body).toMatchObject({ amount_cents: 5500, restock: true, reason: 'Wrong size' });
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, status: 'returned', refund_amount_cents: 5500, restocked: true, refunded_at: '2026-01-02T00:00:00Z', refund_reason: 'Wrong size' }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Wrong size' } });
  fireEvent.click(screen.getByRole('button', { name: /process refund/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/orders/ORD-1001/refund' && o?.method === 'POST');
    expect(call).toBeTruthy();
  });
});

it('shows a read-only refund summary instead of the form when the order is already refunded', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      // A partial refund (2000, not the fixture's full 5500 total) so its
      // rendered "$20.00" is textually distinct from the page's own
      // "Total paid" field (which would also read "$55.00" for this same
      // ORDER fixture) - getByText would otherwise match both and throw
      // on multiple elements.
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, status: 'returned', refund_amount_cents: 2000, restocked: true, refunded_at: '2026-01-02T00:00:00Z', refund_reason: 'Wrong size' }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  expect(screen.getByText('$20.00')).toBeInTheDocument();
  expect(screen.getByText(/wrong size/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/refund amount/i)).not.toBeInTheDocument();
});

it('surfaces an error when the refund fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/refund' && opts?.method === 'POST') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'This order has already been refunded.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getByRole('button', { name: /process refund/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/already been refunded/i);
});

it('logs out on a 401 from the refund submission', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/refund' && opts?.method === 'POST') {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getByRole('button', { name: /process refund/i }));

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test file to confirm the new tests fail**

Run: `cd frontend && npx vitest run src/pages/AdminOrderDetailPage.test.jsx`
Expected: FAIL — no refund section exists yet.

- [ ] **Step 3: Add refund state to `frontend/src/pages/AdminOrderDetailPage.jsx`**

Find this line near the top of the component:

```jsx
  const [shippingError, setShippingError] = useState(null);
```

Add immediately after it:

```jsx
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundRestock, setRefundRestock] = useState(true);
  const [refundReason, setRefundReason] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState(null);
```

Find this block inside the `useEffect` that loads the order (the `.then((data) => { ... })` callback):

```jsx
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data);
        setSelectedStatus(data.status);
        setCarrierInput(data.carrier || '');
        setTrackingInput(data.tracking_number || '');
      })
```

Replace it with:

```jsx
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data);
        setSelectedStatus(data.status);
        setCarrierInput(data.carrier || '');
        setTrackingInput(data.tracking_number || '');
        // Pre-fill the refund amount with the order's real total (in
        // dollars, since the input is a plain number field, not a cents
        // field) - only meaningful pre-refund; already-refunded orders
        // show a read-only summary instead of this form entirely.
        if (!data.refunded_at) {
          const total = computeOrderTotal(data);
          if (total != null) setRefundAmountInput(String(total / 100));
        }
      })
```

- [ ] **Step 4: Add the refund submit handler to `frontend/src/pages/AdminOrderDetailPage.jsx`**

Find this function:

```jsx
  async function saveShipping() {
```

Add immediately before it:

```jsx
  async function processRefund() {
    setRefundSaving(true);
    setRefundError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: Math.round(Number(refundAmountInput) * 100),
          restock: refundRestock,
          reason: refundReason || null,
        }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong processing that refund.');
      }
      const updated = await res.json();
      setOrder(updated);
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setRefundSaving(false);
    }
  }

  async function saveShipping() {
```

- [ ] **Step 5: Add the Refund section to `AdminOrderDetailPage.jsx`'s render**

Find the closing of the Shipping section — the final `</div>` right before the component's own closing `);`:

```jsx
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

Replace it with:

```jsx
        {hasAddress ? (
          <div className="admin-order-detail-downloads">
            <a href={`/api/admin/orders/${orderNumber}/invoice.pdf`}>Download Invoice</a>
            <a href={`/api/admin/orders/${orderNumber}/packing-slip.pdf`}>Download Packing Slip</a>
          </div>
        ) : (
          <p className="subtitle">Downloads unavailable until this order has a shipping address.</p>
        )}
      </div>

      <div className="admin-order-detail-refund">
        <h2>Refund</h2>

        {order.refunded_at ? (
          <>
            <div className="admin-order-detail-field">
              <span>Refunded</span>
              <span>{formatCents(order.refund_amount_cents)}</span>
            </div>
            <div className="admin-order-detail-field">
              <span>Restocked</span>
              <span>{order.restocked ? 'Yes' : 'No'}</span>
            </div>
            {order.refund_reason && (
              <div className="admin-order-detail-field">
                <span>Reason</span>
                <span>{order.refund_reason}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <label htmlFor="admin-order-refund-amount">Refund amount ($)</label>
            <input
              id="admin-order-refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={refundAmountInput}
              onChange={(e) => setRefundAmountInput(e.target.value)}
            />
            <label className="admin-order-detail-restock-row">
              <input
                type="checkbox"
                checked={refundRestock}
                onChange={(e) => setRefundRestock(e.target.checked)}
              />
              Restore item to stock
            </label>
            <label htmlFor="admin-order-refund-reason">Reason (optional)</label>
            <textarea
              id="admin-order-refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <button type="button" onClick={processRefund} disabled={refundSaving}>
              {refundSaving ? 'Processing...' : 'Process Refund'}
            </button>
            {refundError && (
              <p className="verify-error" role="alert">
                {refundError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/pages/AdminOrderDetailPage.test.jsx`
Expected: PASS, all tests including the 5 new ones and every pre-existing test in the file.

- [ ] **Step 7: Add the `.returned` badge and refund-section CSS to `frontend/src/index.css`**

Find `.order-status-badge.active` (the third of the three existing `.order-status-badge.*` rules) and add a new rule right after it:

```css
.order-status-badge.returned {
  background: var(--color-warning-surface);
  color: var(--color-warning-text);
}
```

Find `.admin-order-detail-downloads` (near the end of the `.admin-order-detail-*` rule block) and add these new rules after it:

```css
.admin-order-detail-refund {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.admin-order-detail-refund h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-base);
}

.admin-order-detail-refund label {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
}

.admin-order-detail-refund input,
.admin-order-detail-refund textarea {
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

.admin-order-detail-restock-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-order-detail-refund button {
  margin-top: var(--space-3);
}
```

- [ ] **Step 8: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 9: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/AdminOrderDetailPage.jsx frontend/src/pages/AdminOrderDetailPage.test.jsx frontend/src/index.css
git commit -m "Add a Refund section to the admin order detail page"
```

---

## Post-plan manual verification (not a task — do this after both tasks land)

Start the dev server, log in as admin, then confirm in the browser:
1. Open a real seeded order's detail page — the Refund section shows an amount pre-filled with the order's real total, a checked "Restore item to stock" checkbox, and an optional reason field.
2. Process a full refund with restocking on — the order's status badge (wherever shown) reflects "Returned", the Refund section switches to the read-only summary, and the corresponding product's stock count in `/admin/products` increased by 1.
3. Try refunding the same order again — the read-only summary is shown instead of a form at all, so there's no way to submit a second refund through the UI.
4. Process a partial refund on a different order with restocking off — confirm the product's stock count is unchanged.
5. Confirm the customer-facing `/orders` page (logged in as that order's customer) renders the "Returned" badge correctly for the refunded order, with no code changes needed there — it was already built to handle this status.
