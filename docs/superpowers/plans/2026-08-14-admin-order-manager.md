# Admin Order List & Status Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an authenticated admin a paginated, filterable/searchable table of every customer order, an order detail page, and the ability to change an order's status.

**Architecture:** A new admin-only backend layer (`adminOrderService.js` → `adminOrderController.js` → `adminOrderRoutes.js`, mounted at `/api/admin/orders` behind the existing `requireAdminAuth`) that mirrors the real customer order code's keyset-pagination and caching conventions, paired with two new admin frontend pages (`AdminOrdersPage.jsx`, `AdminOrderDetailPage.jsx`) that replace the current placeholder dashboard.

**Tech Stack:** Node/Express (`src/`), `node-postgres` (`pool.query`), React/Vite (`frontend/src/`), `node:test`/`node:assert` (backend), Vitest + Testing Library (frontend).

## Global Constraints

- Real order statuses only: `'processing'`, `'shipped'`, `'out_for_delivery'`, `'delivered'`, `'cancelled'` (the exact `CHECK` constraint in `migrations/1784973065584_initial-schema.sql`). No `pending`, no `completed`.
- No shipping address anywhere — that column doesn't exist on `orders`.
- No new migration. No changes to customer-facing routes/services except the one `orderCache` invalidation call and comment update described in Task 1.
- Every admin route in this feature requires `requireAdminAuth` (httpOnly `adminToken` cookie).
- Follow this codebase's existing test split: service-level unit tests mock `pool.query` directly (see `test/orderService.test.js`); route-level tests spin up the real app via `app.listen(0)` and `fetch` (see `test/adminAuth.test.js`'s `withServer` helper). There is no separate controller-unit-test file convention here — controller logic is exercised through the route-level tests.

---

### Task 1: `adminOrderService.js` — admin-wide order queries + status update

**Files:**
- Create: `src/services/adminOrderService.js`
- Modify: `src/config/cache.js:3-12` (update the stale "orders are effectively read-only" comment)
- Test: `test/adminOrderService.test.js`

**Interfaces:**
- Consumes: `pool` from `src/config/db.js`; `orderCache` from `src/config/cache.js`; `encodeCursor`, `decodeCursor`, `InvalidCursorError`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` re-exported from `src/services/orderService.js` (import and re-use directly, do not redefine).
- Produces: `ORDER_STATUSES` (array of the five real status strings, frozen), `getAdminOrders(({ status, q, cursor, limit } = {}))` → `Promise<{ orders: object[], nextCursor: string|null }>`, throws `InvalidCursorError` on a bad cursor; `updateOrderStatus(orderNumber, status)` → `Promise<object|null>` (the updated row, or `null` if `orderNumber` doesn't exist), throws `Error` if `status` isn't in `ORDER_STATUSES`.

- [ ] **Step 1: Write the failing tests for `getAdminOrders`**

```js
// test/adminOrderService.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const adminOrderService = require('../src/services/adminOrderService');

test.beforeEach(() => orderCache.clear());

test('getAdminOrders queries across all customers with no email filter', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.doesNotMatch(sql, /customer_email = \$/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return { rows: [{ order_number: 'ORD-1001' }] };
  });

  const { orders, nextCursor } = await adminOrderService.getAdminOrders();
  assert.equal(orders.length, 1);
  assert.equal(nextCursor, null);
});

test('getAdminOrders filters by status when provided', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /status = \$1/);
    assert.equal(params[0], 'shipped');
    return { rows: [] };
  });

  await adminOrderService.getAdminOrders({ status: 'shipped' });
});

test('getAdminOrders rejects a status that is not one of the five real values', async (t) => {
  await assert.rejects(adminOrderService.getAdminOrders({ status: 'pending' }));
});

test('getAdminOrders searches order_number and customer_email with q', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /order_number ILIKE/);
    assert.match(sql, /customer_email ILIKE/);
    assert.ok(params.includes('%ORD-1001%'));
    return { rows: [] };
  });

  await adminOrderService.getAdminOrders({ q: 'ORD-1001' });
});

test('getAdminOrders paginates with a nextCursor when more rows remain', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      { order_number: 'ORD-1003', created_at: '2026-01-03T00:00:00Z', id: 3 },
      { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
      { order_number: 'ORD-1001', created_at: '2026-01-01T00:00:00Z', id: 1 },
    ],
  }));

  const { orders, nextCursor } = await adminOrderService.getAdminOrders({ limit: 2 });
  assert.equal(orders.length, 2);
  assert.ok(typeof nextCursor === 'string' && nextCursor.length > 0);
});

test('getAdminOrders rejects a malformed cursor', async (t) => {
  await assert.rejects(
    adminOrderService.getAdminOrders({ cursor: 'not-json' }),
    adminOrderService.InvalidCursorError
  );
});

test('getAdminOrders is not cached - two identical calls query twice', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await adminOrderService.getAdminOrders();
  await adminOrderService.getAdminOrders();

  assert.equal(query.mock.callCount(), 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern="getAdminOrders"` (or `node --test test/adminOrderService.test.js` with the env vars from `package.json`'s `test` script)
Expected: FAIL with "Cannot find module '../src/services/adminOrderService'"

- [ ] **Step 3: Implement `getAdminOrders`**

```js
// src/services/adminOrderService.js
const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');
const {
  encodeCursor,
  decodeCursor,
  InvalidCursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./orderService');

// The five real values in the `orders.status` CHECK constraint
// (migrations/1784973065584_initial-schema.sql) - no 'pending', no
// 'completed', and an extra 'out_for_delivery' step that components.md's
// wording didn't account for. Frozen so a caller can't accidentally
// mutate the allowlist.
const ORDER_STATUSES = Object.freeze([
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

async function getAdminOrders({ status = null, q = null, limit = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
  if (status !== null && !ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const after = cursor ? decodeCursor(cursor) : null;

  // Not cached (see getAdminOrders' own doc comment below) - this call
  // always hits the database.
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE '%' || $2 || '%' OR customer_email ILIKE '%' || $2 || '%')
       AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4))
     ORDER BY created_at DESC, id DESC
     LIMIT $5`,
    [status, q, after?.createdAt ?? null, after?.id ?? null, pageSize + 1]
  );

  const hasMore = rows.length > pageSize;
  const orders = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? encodeCursor(orders[orders.length - 1]) : null;

  return { orders, nextCursor };
}

module.exports = {
  ORDER_STATUSES,
  InvalidCursorError,
  getAdminOrders,
};
```

- [ ] **Step 4: Run to verify the `getAdminOrders` tests pass**

Run: `node --test test/adminOrderService.test.js` (with the same env vars `package.json`'s `test` script sets)
Expected: PASS (7 tests)

- [ ] **Step 5: Write the failing tests for `updateOrderStatus`**

```js
// append to test/adminOrderService.test.js

test('updateOrderStatus rejects a status outside the five real values', async (t) => {
  await assert.rejects(adminOrderService.updateOrderStatus('ORD-1001', 'pending'));
});

test('updateOrderStatus runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET status = \$1 WHERE order_number = \$2/);
    assert.deepEqual(params, ['shipped', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
  });

  const order = await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');
  assert.equal(order.status, 'shipped');
});

test('updateOrderStatus returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderStatus('NOPE', 'shipped');
  assert.equal(order, null);
});

test('updateOrderStatus invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'processing' });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped' }],
  }));

  await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');

  assert.equal(orderCache.has('order:ORD-1001'), false);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test test/adminOrderService.test.js`
Expected: FAIL - `adminOrderService.updateOrderStatus is not a function`

- [ ] **Step 7: Implement `updateOrderStatus`**

```js
// add to src/services/adminOrderService.js, above module.exports

// The one write path in this file - config/cache.js documents orderCache
// as safe because "nothing exposed here ever writes to it," anticipating
// exactly this as the future exception. getOrderByNumber (orderService.js)
// and the chat tool get_order_by_number both read through the same
// `order:${orderNumber}` cache key, so without this delete a customer or
// the chat tool could keep seeing the pre-update status for up to
// orderCache's 60s TTL after an admin changes it.
async function updateOrderStatus(orderNumber, status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const { rows } = await pool.query(
    'UPDATE orders SET status = $1 WHERE order_number = $2 RETURNING *',
    [status, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) {
    orderCache.delete(`order:${orderNumber}`);
  }
  return order;
}
```

Update the `module.exports` at the bottom of `src/services/adminOrderService.js` to also include `updateOrderStatus`:

```js
module.exports = {
  ORDER_STATUSES,
  InvalidCursorError,
  getAdminOrders,
  updateOrderStatus,
};
```

- [ ] **Step 8: Run to verify the `updateOrderStatus` tests pass**

Run: `node --test test/adminOrderService.test.js`
Expected: PASS (11 tests total)

- [ ] **Step 9: Update the stale comment in `src/config/cache.js`**

Replace the comment above `orderCache` (currently claims orders are read-only and "nothing exposed here ever writes to it") with:

```js
// Orders were originally read-only here - migrations seed the table and
// nothing else wrote to it - but adminOrderService.updateOrderStatus now
// does (an admin changing an order's status). That function deletes its
// own `order:${orderNumber}` cache entry immediately after a successful
// write, so a stale row is never served past that point; the bounded TTL
// below still matters for two reasons independent of that write path: (1)
// list-shaped cache entries (getOrdersByEmail's `list:*` keys) aren't
// individually invalidated by a status change, so a customer's own order
// list can serve a pre-update status for up to this TTL, and (2)
// order_number/trackingNumber are still client-supplied and unauthenticated
// at this layer, so an attacker probing many nonexistent values shouldn't
// be able to grow this cache without bound.
```

- [ ] **Step 10: Run the full backend test suite**

Run: `npm test`
Expected: PASS (all existing tests plus the 11 new ones, no regressions)

- [ ] **Step 11: Commit**

```bash
git add src/services/adminOrderService.js src/config/cache.js test/adminOrderService.test.js
git commit -m "Add adminOrderService: admin-wide order queries and status updates"
```

---

### Task 2: `adminOrderController.js` + `adminOrderRoutes.js` — wire the HTTP layer

**Files:**
- Create: `src/controllers/adminOrderController.js`
- Create: `src/routes/adminOrderRoutes.js`
- Modify: `src/app.js` (mount the new router)
- Test: `test/adminOrders.test.js`

**Interfaces:**
- Consumes: `adminOrderService.getAdminOrders`, `adminOrderService.updateOrderStatus`, `adminOrderService.ORDER_STATUSES`, `adminOrderService.InvalidCursorError` (Task 1); `orderService.getOrderByNumber` (existing, `src/services/orderService.js`); `requireAdminAuth` (existing, `src/middleware/adminAuth.js`); `auditLog` (existing, `src/config/auditLog.js`); `logError` (existing, `src/utils/logger.js`).
- Produces: three routes mounted at `/api/admin/orders` — `GET /`, `GET /:orderNumber`, `PATCH /:orderNumber/status` — all behind `requireAdminAuth`, matching the customer routes' response shapes (`{ orders, nextCursor }` for the list, the raw order row for detail).

- [ ] **Step 1: Write the failing route-level tests**

```js
// test/adminOrders.test.js
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

test('GET /api/admin/orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/orders returns orders across all customers', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1);
    assert.equal(body.orders[0].customer_email, 'jane@example.com');
  });
});

test('GET /api/admin/orders?status=pending returns 400 for a non-real status', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?status=pending`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?cursor=bad returns 400 for an invalid cursor', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?cursor=not-valid`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders/:orderNumber returns the order regardless of owner', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order_number, 'ORD-1001');
  });
});

test('GET /api/admin/orders/:orderNumber returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 404);
  });
});

test('PATCH /api/admin/orders/:orderNumber/status updates the status', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE orders/.test(sql)) {
      return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
    }
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'shipped' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'shipped');
  });
});

test('PATCH /api/admin/orders/:orderNumber/status rejects a non-real status with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'pending' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PATCH /api/admin/orders/:orderNumber/status returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'shipped' }),
    });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/adminOrders.test.js`
Expected: FAIL - 401 tests pass (route doesn't exist, Express 404s which isn't 401... actually all will fail since the route isn't mounted yet). Confirm every test fails or errors before continuing.

- [ ] **Step 3: Implement `adminOrderController.js`**

```js
// src/controllers/adminOrderController.js
const adminOrderService = require('../services/adminOrderService');
const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

function parseLimit(rawLimit) {
  if (rawLimit === undefined) return undefined;
  const limit = Number(rawLimit);
  return Number.isInteger(limit) ? limit : NaN;
}

async function listOrders(req, res) {
  const limit = parseLimit(req.query.limit);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  const status = req.query.status || null;
  if (status && !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const { orders, nextCursor } = await adminOrderService.getAdminOrders({
      status,
      q: req.query.q || null,
      limit,
      cursor: req.query.cursor,
    });
    res.json({ orders, nextCursor });
  } catch (err) {
    if (err instanceof adminOrderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin order list error', err);
    res.status(500).json({ error: 'Something went wrong looking up orders.' });
  }
}

// Reuses orderService.getOrderByNumber directly - identical lookup and
// cache handling as the customer path, just without the ownership check
// customer requests need (an admin isn't scoped to one customer's orders).
async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    logError('Admin order lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (!status || !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const previous = await orderService.getOrderByNumber(req.params.orderNumber);
    const updated = await adminOrderService.updateOrderStatus(req.params.orderNumber, status);
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }
    auditLog('admin.order.status_updated', {
      orderNumber: req.params.orderNumber,
      from: previous ? previous.status : null,
      to: status,
      admin: req.adminEmail,
    });
    res.json(updated);
  } catch (err) {
    logError('Admin order status update error', err);
    res.status(500).json({ error: 'Something went wrong updating that order.' });
  }
}

module.exports = { listOrders, getOrder, updateStatus };
```

- [ ] **Step 4: Implement `adminOrderRoutes.js`**

```js
// src/routes/adminOrderRoutes.js
const { Router } = require('express');
const { listOrders, getOrder, updateStatus } = require('../controllers/adminOrderController');

const router = Router();

router.get('/', listOrders);
router.get('/:orderNumber', getOrder);
router.patch('/:orderNumber/status', updateStatus);

module.exports = router;
```

- [ ] **Step 5: Mount the router in `src/app.js`**

Add the require near the other route requires (`src/app.js:10`, right after `adminAuthRoutes`):

```js
const adminOrderRoutes = require('./routes/adminOrderRoutes');
```

`requireAdminAuth` is not yet imported anywhere in `src/app.js` (it's currently only used by `src/routes/adminAuthRoutes.js` directly). Add the import alongside the other middleware requires:

```js
const { requireAdminAuth } = require('./middleware/adminAuth');
```

Add the mount near `app.use('/api/admin/auth', adminAuthRoutes);` (`src/app.js:98`), gated by `requireAdminAuth` at the router-mount level (unlike `adminAuthRoutes`, which gates per-route since `/google` must stay public):

```js
app.use('/api/admin/orders', requireAdminAuth, adminOrderRoutes);
```

- [ ] **Step 6: Run to verify the tests pass**

Run: `node --test test/adminOrders.test.js`
Expected: PASS (9 tests)

- [ ] **Step 7: Run the full backend test suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/controllers/adminOrderController.js src/routes/adminOrderRoutes.js src/app.js test/adminOrders.test.js
git commit -m "Add admin order list/detail/status-update routes"
```

---

### Task 3: `AdminOrdersPage.jsx` — admin order table

**Files:**
- Create: `frontend/src/pages/AdminOrdersPage.jsx`
- Test: `frontend/src/pages/AdminOrdersPage.test.jsx`
- Modify: `frontend/src/index.css` (append admin-orders-table styles)

**Interfaces:**
- Consumes: `useAdminAuth` (`../context/AdminAuthContext.jsx`, existing); `Link` from `react-router-dom`; fetches `GET /api/admin/orders?status=&q=&cursor=&limit=` (Task 2), reading `{ orders, nextCursor }`.
- Produces: `export function AdminOrdersPage()` — default export consumed by `App.jsx` in Task 5 as the `/admin` index route, linking each row to `/admin/orders/:orderNumber` (Task 4).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/AdminOrdersPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminOrdersPage } from './AdminOrdersPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
          ],
          nextCursor: null,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders orders returned from the API', async () => {
  renderPage();
  expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
  expect(screen.getByText('jane@example.com')).toBeInTheDocument();
});

it('re-fetches with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });

  await waitFor(() => {
    const calledWithStatus = global.fetch.mock.calls.some(([url]) => String(url).includes('status=shipped'));
    expect(calledWithStatus).toBe(true);
  });
});

it('re-fetches with the search query when typed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/search orders/i), { target: { value: 'ORD-1001' } });

  await waitFor(() => {
    const calledWithQuery = global.fetch.mock.calls.some(([url]) => String(url).includes('q=ORD-1001'));
    expect(calledWithQuery).toBe(true);
  });
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up orders.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminOrdersPage`
Expected: FAIL - `Failed to resolve import "./AdminOrdersPage.jsx"`

- [ ] **Step 3: Implement `AdminOrdersPage.jsx`**

```jsx
// frontend/src/pages/AdminOrdersPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Same status -> pill class map OrdersPage.jsx's HISTORY_BADGE already
// uses (index.css's .order-history-badge.status-* rules) - reused here
// rather than inventing a second admin-only palette for the same five
// values.
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ status, q, cursor }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function AdminOrdersPage() {
  useAdminAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Re-fetches page one whenever the status filter or search text changes -
  // this table is admin-wide and can be large, so filtering happens
  // server-side (unlike OrdersPage.jsx's client-side filter over one
  // customer's already-small history).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/orders?${buildQuery({ status, q })}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up orders.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setOrders(data.orders);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, q]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/orders?${buildQuery({ status, q, cursor: nextCursor })}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong looking up orders.');
      }
      const data = await res.json();
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-orders-page">
      <h1>Orders</h1>

      <div className="admin-orders-toolbar">
        <label htmlFor="admin-orders-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="admin-orders-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-orders-search" className="sr-only">
            Search orders by order number or email
          </label>
          <input
            id="admin-orders-search"
            type="text"
            placeholder="Search by order # or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <table className="admin-orders-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.order_number}>
                <td>
                  <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
                </td>
                <td>{order.customer_email}</td>
                <td>{order.product_name}</td>
                <td>
                  <span className={`order-history-badge ${STATUS_BADGE_CLASS[order.status] ?? 'status-active'}`}>
                    {order.status}
                  </span>
                </td>
                <td>{dateFormatter.format(new Date(order.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextCursor && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminOrdersPage`
Expected: PASS (4 tests)

- [ ] **Step 5: Add table styles to `frontend/src/index.css`**

Append near the end of the file, after the existing `.admin-login-error` block:

```css
.admin-orders-page {
  padding: var(--space-4);
}

.admin-orders-toolbar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: var(--space-3) 0;
}

.admin-orders-toolbar select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-orders-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  flex: 1;
  max-width: 320px;
}

.admin-orders-search input {
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  width: 100%;
}

.admin-orders-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.admin-orders-table th,
.admin-orders-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.admin-orders-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.admin-orders-table tbody tr:last-child td {
  border-bottom: none;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminOrdersPage.jsx frontend/src/pages/AdminOrdersPage.test.jsx frontend/src/index.css
git commit -m "Add AdminOrdersPage: admin-wide order table with filter and search"
```

---

### Task 4: `AdminOrderDetailPage.jsx` — order detail + status editor

**Files:**
- Create: `frontend/src/pages/AdminOrderDetailPage.jsx`
- Test: `frontend/src/pages/AdminOrderDetailPage.test.jsx`
- Modify: `frontend/src/index.css` (append detail-page styles)

**Interfaces:**
- Consumes: `useParams` from `react-router-dom`; `computeOrderTotal`, `formatCents` from `../utils/pricing.js` (existing); fetches `GET /api/admin/orders/:orderNumber` and `PATCH /api/admin/orders/:orderNumber/status` (Task 2).
- Produces: `export function AdminOrderDetailPage()` — consumed by `App.jsx` in Task 5 at `/admin/orders/:orderNumber`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/AdminOrderDetailPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminOrderDetailPage } from './AdminOrderDetailPage.jsx';

const ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  status: 'shipped',
  carrier: 'UPS',
  tracking_number: '1Z999',
  created_at: '2026-01-01T00:00:00Z',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
};

function renderPage(orderNumber = 'ORD-1001') {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[`/admin/orders/${orderNumber}`]}>
        <Routes>
          <Route path="/admin/orders/:orderNumber" element={<AdminOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/NOPE') {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Order not found' }) });
    }
    if (url === '/api/admin/orders/ORD-1001/status' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...ORDER, status: 'delivered' }) });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders the order detail fields', async () => {
  renderPage();
  expect(await screen.findByText('Sneakers')).toBeInTheDocument();
  expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  expect(screen.getByText('UPS')).toBeInTheDocument();
});

it('shows a not-found message for an unknown order', async () => {
  renderPage('NOPE');
  expect(await screen.findByRole('alert')).toHaveTextContent(/order not found/i);
});

it('updates the status and reflects the new value on success', async () => {
  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/change status/i), { target: { value: 'delivered' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/orders/ORD-1001/status',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'delivered' }) })
    );
  });
  expect(await screen.findByText(/status updated/i)).toBeInTheDocument();
});

it('surfaces an error when the status update fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (opts?.method === 'PATCH') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong updating that order.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminOrderDetailPage`
Expected: FAIL - `Failed to resolve import "./AdminOrderDetailPage.jsx"`

- [ ] **Step 3: Implement `AdminOrderDetailPage.jsx`**

```jsx
// frontend/src/pages/AdminOrderDetailPage.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const STATUS_OPTIONS = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function AdminOrderDetailPage() {
  useAdminAuth();
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
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that order.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
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
        <button type="button" onClick={saveStatus} disabled={saving || selectedStatus === order.status}>
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

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminOrderDetailPage`
Expected: PASS (4 tests)

- [ ] **Step 5: Add detail-page styles to `frontend/src/index.css`**

Append after the `.admin-orders-table` rules added in Task 3:

```css
.admin-order-detail-page {
  padding: var(--space-4);
  max-width: 480px;
}

.admin-order-detail-field {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.admin-order-detail-field span:first-child {
  color: var(--color-text-muted);
}

.admin-order-detail-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.admin-order-detail-status select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-order-detail-saved {
  margin-top: var(--space-2);
  color: var(--color-success-text);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminOrderDetailPage.jsx frontend/src/pages/AdminOrderDetailPage.test.jsx frontend/src/index.css
git commit -m "Add AdminOrderDetailPage: order detail view with status editor"
```

---

### Task 5: Wire the new pages into `App.jsx`, retire the placeholder dashboard, manual verification

**Files:**
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/pages/AdminDashboardPage.jsx` (superseded — its own doc comment says it's a placeholder until the real admin panel exists)

**Interfaces:**
- Consumes: `AdminOrdersPage` (Task 3), `AdminOrderDetailPage` (Task 4), existing `AdminProtectedRoute`, `AdminAuthProvider`.
- Produces: `/admin` now renders `AdminOrdersPage` (behind `AdminProtectedRoute`); `/admin/orders/:orderNumber` renders `AdminOrderDetailPage` (behind the same guard). `/admin/login` is unchanged.

- [ ] **Step 1: Update the lazy imports in `frontend/src/App.jsx`**

Replace the `AdminDashboardPage` lazy import (`frontend/src/App.jsx:40-42`) with:

```jsx
const AdminOrdersPage = lazy(() =>
  import('./pages/AdminOrdersPage.jsx').then((m) => ({ default: m.AdminOrdersPage }))
);
const AdminOrderDetailPage = lazy(() =>
  import('./pages/AdminOrderDetailPage.jsx').then((m) => ({ default: m.AdminOrderDetailPage }))
);
```

- [ ] **Step 2: Update the `/admin/*` route branch**

Replace (`frontend/src/App.jsx:104-109`):

```jsx
            >
              <Route path="login" element={<AdminLoginPage />} />
              <Route element={<AdminProtectedRoute />}>
                <Route index element={<AdminDashboardPage />} />
              </Route>
            </Route>
```

with:

```jsx
            >
              <Route path="login" element={<AdminLoginPage />} />
              <Route element={<AdminProtectedRoute />}>
                <Route index element={<AdminOrdersPage />} />
                <Route path="orders/:orderNumber" element={<AdminOrderDetailPage />} />
              </Route>
            </Route>
```

- [ ] **Step 3: Delete the placeholder dashboard**

```bash
git rm frontend/src/pages/AdminDashboardPage.jsx
```

- [ ] **Step 4: Run the full frontend test suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions (confirms nothing else still imports `AdminDashboardPage`)

- [ ] **Step 5: Run the full backend test suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 6: Manual verification in the browser**

Start both servers (`npm run dev` for the backend, `npm --prefix frontend run dev` for the frontend — port 5173), sign in at `/admin/login` with the allowlisted Google account, and confirm:
- `/admin` shows the order table with real seeded orders.
- The status filter dropdown and search box each narrow the table (check the network tab for the right query params).
- "Load more" appears and works if there are enough seeded orders to paginate.
- Clicking an order number navigates to `/admin/orders/:orderNumber` and shows its real fields.
- Changing the status dropdown and clicking Save updates the status, shows "Status updated.", and the change is reflected if you reload `/orders/:orderNumber` as the owning customer (confirms the `orderCache` invalidation from Task 1 actually works end to end, not just in the unit test).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "Wire AdminOrdersPage and AdminOrderDetailPage into /admin routes"
```

---

## Post-Plan Notes (not part of this plan's scope)

- RBAC / Admin-vs-Staff permissions, product management, and store/payment settings remain separate, not-yet-brainstormed sub-projects from `components.md`'s Phase 1.
- No bulk status updates, CSV export, or admin-initiated order creation/deletion — out of scope per the spec.
