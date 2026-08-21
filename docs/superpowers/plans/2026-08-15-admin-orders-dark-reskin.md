# Admin Orders Page Dark Reskin + Numbered Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the admin Orders page (`/admin`) to a fixed dark theme with a real Total column and numbered pagination, replacing today's light theme and cursor-based "Load more."

**Architecture:** No new files. Two backend files move `adminOrderService.getAdminOrders`/`adminOrderController.listOrders` from keyset-cursor pagination to offset/limit pagination with a total row count. Two frontend files (`AdminOrdersPage.jsx`, its CSS in `index.css`) get a full rewrite of their fetch/render logic and styling; `AdminNav.jsx`'s existing CSS rules get recolored (no JSX change) so the nav bar reads as dark on every admin page. This was approved as an artifact mockup first (published design, not written to a spec doc per explicit user request) — this plan is the direct handoff from that approved design.

**Tech Stack:** Express + `pg` (`pool.query`), React (no new dependencies), `node:test` for backend tests, Vitest + Testing Library for frontend tests.

## Global Constraints

- Dark palette is fixed hex values, not tied to the app's existing `--color-*` light/dark toggle: background `#0a0a0a`, surface `#171717`, recessed surface `#141414`, border `#434343`, primary text `#fafafa`, secondary text `#a1a1a1`, muted `#6b6b6b`.
- Status badge colors reuse the app's *existing* dark-mode `.order-history-badge` palette verbatim (`index.css`'s `:root[data-theme="dark"] .order-history-badge.*` rules) rather than inventing new hues — pinned inline here since this page is always-dark regardless of the site's theme toggle.
- Interactive-element accent (current page button, focus ring) is monochrome near-white-on-dark (`#fafafa` bg / `#101010` text), matching this app's existing `--color-primary` dark-mode convention — no invented colored accent.
- Scope is the Orders page + toolbar + the shared `AdminNav` bar only. `AdminProductsPage`/`AdminCustomersPage` and their content areas are explicitly untouched by this plan.
- No checkboxes, no customer avatars, no Fulfillment/Payment badge split, no Items/products count, no Export button, no "New order" button — none are backed by real data or functionality in this app.
- Rows-per-page options: 10 / 25 / 50, default 10.
- `Total` column is computed with the existing `computeOrderTotal`/`formatCents` utilities from `frontend/src/utils/pricing.js` — do not reimplement that math.
- The `page`/`pageSize` query-param contract on `GET /api/admin/orders` is a breaking change to that one internal endpoint (its only consumer is `AdminOrdersPage.jsx`) — no `cursor` back-compat shim.

---

## Task 1: Backend — offset/limit pagination in `adminOrderService`

**Files:**
- Modify: `src/services/adminOrderService.js`
- Test: `test/adminOrderService.test.js`

**Interfaces:**
- Consumes: `DEFAULT_PAGE_SIZE` (20), `MAX_PAGE_SIZE` (100) from `src/services/orderService.js` (unchanged, already exported there).
- Produces: `getAdminOrders({ status = null, q = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {})` → `Promise<{ orders: object[], total: number, page: number, pageSize: number }>`. Drops the old `cursor`/`limit`/`nextCursor` shape and the `InvalidCursorError` export entirely — Task 2's controller depends on this exact new signature and return shape.

- [ ] **Step 1: Replace `test/adminOrderService.test.js`'s pagination tests with the offset/limit versions**

The file mixes pagination tests (need rewriting) with `updateOrderStatus`/`updateOrderShipping` tests (leave untouched). Replace only the top block, from the `test.beforeEach` through the malformed-cursor test, with:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const adminOrderService = require('../src/services/adminOrderService');

test.beforeEach(() => orderCache.clear());

test('getAdminOrders queries across all customers with no email filter', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.doesNotMatch(sql, /customer_email = \$/);
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '1' }] };
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return { rows: [{ order_number: 'ORD-1001' }] };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders();
  assert.equal(orders.length, 1);
  assert.equal(total, 1);
  assert.equal(page, 1);
  assert.equal(pageSize, 20);
});

test('getAdminOrders filters by status when provided', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /status = \$1/);
    assert.equal(params[0], 'shipped');
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
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
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminOrderService.getAdminOrders({ q: 'ORD-1001' });
});

test('getAdminOrders paginates using LIMIT/OFFSET derived from page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '5' }] };
    assert.match(sql, /LIMIT \$3 OFFSET \$4/);
    assert.deepEqual(params.slice(2), [2, 2]); // pageSize 2, page 2 -> offset (2-1)*2 = 2
    return {
      rows: [
        { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
        { order_number: 'ORD-1001', created_at: '2026-01-01T00:00:00Z', id: 1 },
      ],
    };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders({ page: 2, pageSize: 2 });
  assert.equal(orders.length, 2);
  assert.equal(total, 5);
  assert.equal(page, 2);
  assert.equal(pageSize, 2);
});

test('getAdminOrders clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '0' }] };
    assert.deepEqual(params.slice(2), [100, 0]); // pageSize clamped 999 -> 100, page clamped 0 -> 1 -> offset 0
    return { rows: [] };
  });

  const { page, pageSize } = await adminOrderService.getAdminOrders({ page: 0, pageSize: 999 });
  assert.equal(page, 1);
  assert.equal(pageSize, 100);
});

test('getAdminOrders is not cached - two identical calls query the database four times (count + select, twice)', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) =>
    (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] })
  );

  await adminOrderService.getAdminOrders();
  await adminOrderService.getAdminOrders();

  assert.equal(query.mock.callCount(), 4);
});
```

Everything from `test('updateOrderStatus rejects a status outside the five real values' ...)` onward in the existing file is untouched.

- [ ] **Step 2: Run the test file to confirm the new/changed tests fail**

Run: `node --test test/adminOrderService.test.js`
Expected: FAIL — `getAdminOrders` still returns `{ orders, nextCursor }`, so `total`/`page`/`pageSize` are `undefined`, and the service never issues a `COUNT(*)` query so the mock's `/COUNT\(\*\)/` branch is never exercised as expected by the assertions above.

- [ ] **Step 3: Rewrite `getAdminOrders` in `src/services/adminOrderService.js`**

Replace the `getAdminOrders` function (and its import line) with:

```javascript
const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

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

async function getAdminOrders({ status = null, q = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (status !== null && !ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const clampedPageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const clampedPage = Math.max(1, page);
  const offset = (clampedPage - 1) * clampedPageSize;
  const searchTerm = q ? `%${q}%` : null;

  // Not cached (see getAdminOrders' own doc comment below) - this call
  // always hits the database. Two queries, not one COUNT(*) OVER() window
  // function - a zero-row page (filters that match nothing) would silently
  // drop the total along with the rows, since a window function's count
  // rides on a row that no longer exists. A plain COUNT(*) always returns
  // exactly one row regardless of how many orders match.
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE $2 OR customer_email ILIKE $2)`,
    [status, searchTerm]
  );
  const total = Number(countResult.rows[0].total);

  const { rows: orders } = await pool.query(
    `SELECT * FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE $2 OR customer_email ILIKE $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [status, searchTerm, clampedPageSize, offset]
  );

  return { orders, total, page: clampedPage, pageSize: clampedPageSize };
}
```

`updateOrderStatus`, `updateOrderShipping`, and the trailing `module.exports` stay as they are, except drop `InvalidCursorError` from the exports object (it's no longer imported, and nothing throws it anymore):

```javascript
module.exports = {
  ORDER_STATUSES,
  getAdminOrders,
  updateOrderStatus,
  updateOrderShipping,
};
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `node --test test/adminOrderService.test.js`
Expected: PASS, all tests including the untouched `updateOrderStatus`/`updateOrderShipping` ones below.

- [ ] **Step 5: Commit**

```bash
git add src/services/adminOrderService.js test/adminOrderService.test.js
git commit -m "Switch admin order list to offset/limit pagination with a total count"
```

---

## Task 2: Backend — `page`/`pageSize` contract in the controller and route tests

**Files:**
- Modify: `src/controllers/adminOrderController.js`
- Test: `test/adminOrders.test.js`

**Interfaces:**
- Consumes: `adminOrderService.getAdminOrders({ status, q, page, pageSize })` → `{ orders, total, page, pageSize }` (from Task 1).
- Produces: `GET /api/admin/orders?status=&q=&page=&pageSize=` → `200 { orders, total, page, pageSize }`, or `400 { error }` for a non-integer/non-positive `page` or `pageSize`, or an unrecognized `status`.

- [ ] **Step 1: Replace `test/adminOrders.test.js` with the updated contract**

```javascript
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

function mockOrdersQuery(t, { total = 0, rows = [] } = {}) {
  return t.mock.method(pool, 'query', async (sql) =>
    (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: String(total) }] } : { rows })
  );
}

test('GET /api/admin/orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/orders returns orders across all customers with a total count', async (t) => {
  mockOrdersQuery(t, { total: 1, rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }] });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1);
    assert.equal(body.orders[0].customer_email, 'jane@example.com');
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 20);
  });
});

test('GET /api/admin/orders?page=2&pageSize=10 forwards page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '15' }] };
    assert.deepEqual(params.slice(2), [10, 10]); // pageSize 10, offset (2-1)*10
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=2&pageSize=10`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.page, 2);
    assert.equal(body.pageSize, 10);
  });
});

test('GET /api/admin/orders?page=abc returns 400 for a non-integer page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?page=0 returns 400 for a non-positive page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=0`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?pageSize=abc returns 400 for a non-integer pageSize', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?pageSize=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
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

- [ ] **Step 2: Run the test file to confirm the new/changed tests fail**

Run: `node --test test/adminOrders.test.js`
Expected: FAIL — the controller still parses `limit`/`cursor`, so `page`/`pageSize` query params are ignored and the response body still has `nextCursor` instead of `total`/`page`/`pageSize`; the `page=abc`/`page=0`/`pageSize=abc` requests don't 400.

- [ ] **Step 3: Rewrite `listOrders` in `src/controllers/adminOrderController.js`**

Replace `parseLimit` and `listOrders` with:

```javascript
function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

async function listOrders(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    return res.status(400).json({ error: 'page must be a positive integer.' });
  }

  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    return res.status(400).json({ error: 'pageSize must be a positive integer.' });
  }

  const status = req.query.status || null;
  if (status && !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const result = await adminOrderService.getAdminOrders({
      status,
      q: req.query.q || null,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    logError('Admin order list error', err);
    res.status(500).json({ error: 'Something went wrong looking up orders.' });
  }
}
```

Everything else in the file (`getOrder`, `updateStatus`, `getInvoicePdf`, `getPackingSlipPdf`, `updateShipping`, `module.exports`) is unchanged.

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `node --test test/adminOrders.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites (this touches shared code — `orderService`'s `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` exports weren't changed, so no other file should be affected).

- [ ] **Step 6: Commit**

```bash
git add src/controllers/adminOrderController.js test/adminOrders.test.js
git commit -m "Move GET /api/admin/orders to a page/pageSize/total contract"
```

---

## Task 3: Frontend — `AdminOrdersPage` dark reskin, Total column, numbered pagination

**Files:**
- Modify: `frontend/src/pages/AdminOrdersPage.jsx`
- Modify: `frontend/src/index.css` (replace the `.admin-orders-*` rule block, lines 7907–7970 in the current file, with the new dark rules below — everything from `.admin-order-detail-page` onward is untouched by this task)
- Test: `frontend/src/pages/AdminOrdersPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/orders?status=&q=&page=&pageSize=` → `{ orders, total, page, pageSize }` (Task 2). `computeOrderTotal(order)` and `formatCents(cents)` from `frontend/src/utils/pricing.js` (existing, unchanged — `computeOrderTotal` returns `null` when `order.unit_price_cents == null`).
- Produces: nothing consumed by other tasks — this is a leaf page component.

- [ ] **Step 1: Replace `frontend/src/pages/AdminOrdersPage.test.jsx` with the updated test suite**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
          total: 1,
          page: 1,
          pageSize: 10,
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

it('computes and displays the order total from pricing fields', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            {
              order_number: 'ORD-1001',
              customer_email: 'jane@example.com',
              product_name: 'Sneakers',
              status: 'shipped',
              created_at: '2026-01-01T00:00:00Z',
              unit_price_cents: 14999,
              delivery_cost_cents: 599,
              vat_cents: 1200,
              voucher_cents: 0,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('$167.98')).toBeInTheDocument();
});

it('re-fetches page 1 with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('status=shipped') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('re-fetches page 1 with the search query when typed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/search orders/i), { target: { value: 'ORD-1001' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('q=ORD-1001') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
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

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('shows numbered page buttons and refetches page 2 on click', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 25, page: 1, pageSize: 10 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('page=2'));
    expect(called).toBe(true);
  });
});

it('resets to page 1 and refetches with the new page size when rows-per-page changes', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 60, page: 1, pageSize: 10 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/rows per page/i)).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/rows per page/i), { target: { value: '25' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('pageSize=25') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('Clear resets status and search, and is disabled with no active filters', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled());

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /clear/i })).not.toBeDisabled());

  fireEvent.click(screen.getByRole('button', { name: /clear/i }));

  expect(screen.getByLabelText(/filter by status/i).value).toBe('');
  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => !String(url).includes('status='));
    expect(called).toBe(true);
  });
});

it('logs out on a 401 when changing page', async () => {
  const initialOrders = [
    { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
  ];
  let fetchCallCount = 0;

  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/orders')) {
      fetchCallCount += 1;
      if (fetchCallCount === 1) {
        return Promise.resolve({ ok: true, json: async () => ({ orders: initialOrders, total: 25, page: 1, pageSize: 10 }) });
      }
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('ignores a stale page-2 response if the filter changes before it resolves', async () => {
  const initialOrders = [
    { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
  ];
  const filteredOrders = [
    { order_number: 'ORD-2002', customer_email: 'bob@example.com', product_name: 'Boots', status: 'delivered', created_at: '2026-01-02T00:00:00Z' },
  ];
  const staleOrders = [
    { order_number: 'ORD-9999', customer_email: 'stale@example.com', product_name: 'Stale Item', status: 'shipped', created_at: '2026-01-03T00:00:00Z' },
  ];

  let resolvePageTwo;
  let fetchCallCount = 0;

  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    fetchCallCount += 1;

    // Call 1: initial page-1 fetch on mount.
    if (fetchCallCount === 1) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ orders: initialOrders, total: 25, page: 1, pageSize: 10 }),
      });
    }

    // Call 2: the page-2 fetch, deliberately left pending so the test can
    // change the filter before it resolves.
    if (fetchCallCount === 2) {
      return new Promise((resolve) => {
        resolvePageTwo = () =>
          resolve({
            ok: true,
            json: async () => ({ orders: staleOrders, total: 25, page: 2, pageSize: 10 }),
          });
      });
    }

    // Call 3: the re-fetch triggered by the status filter change (resets to page 1).
    return Promise.resolve({
      ok: true,
      json: async () => ({ orders: filteredOrders, total: 1, page: 1, pageSize: 10 }),
    });
  });

  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  // Change the filter while the page-2 request is still in flight.
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'delivered' } });

  await screen.findByText('ORD-2002');

  // Now let the stale page-2 response land, and flush the promise chain
  // past a macrotask boundary so a would-be bad update has had its chance
  // to apply before we assert it didn't.
  await act(async () => {
    resolvePageTwo();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(screen.queryByText('ORD-9999')).not.toBeInTheDocument();
  expect(screen.getByText('ORD-2002')).toBeInTheDocument();
  expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/pages/AdminOrdersPage.test.jsx`
Expected: FAIL — the component still uses cursor/"Load more", has no Total column, and has no numbered page buttons or rows-per-page control for the tests to find.

- [ ] **Step 3: Replace `frontend/src/pages/AdminOrdersPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

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
// values. This page pins those classes to their dark-mode colors
// regardless of the site's own light/dark toggle (see index.css).
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ status, q, page, pageSize }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

// Windowed page-number list with ellipsis gaps, e.g. [1, 'ellipsis-start',
// 4, 5, 6, 'ellipsis-end', 12] - the two ellipsis entries get distinct
// string values (not both '...') because they're both real list entries
// React needs a stable, unique `key` for.
function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

export function AdminOrdersPage() {
  const { logout } = useAdminAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  // Re-fetches whenever any of these four change. Unlike the old
  // cursor-based "Load more" version, every page navigation goes through
  // this same effect (not a separately-invoked function), so the
  // standard `cancelled` cleanup flag is enough to drop a stale in-flight
  // response - no extra staleness bookkeeping needed.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/orders?${buildQuery({ status, q, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up orders.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setOrders(data.orders);
        setTotal(data.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, q, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function handleStatusChange(e) {
    setStatus(e.target.value);
    setPage(1);
  }

  function handleSearchChange(e) {
    setQ(e.target.value);
    setPage(1);
  }

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
  }

  function handleClear() {
    setStatus('');
    setQ('');
    setPage(1);
  }

  return (
    <div className="admin-orders-page">
      <div className="admin-orders-head">
        <h1>Orders</h1>
        <span className="admin-orders-count">
          {total} order{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="admin-orders-toolbar">
        <label htmlFor="admin-orders-status" className="sr-only">
          Filter by status
        </label>
        <select id="admin-orders-status" value={status} onChange={handleStatusChange}>
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
            onChange={handleSearchChange}
          />
        </div>

        <button
          type="button"
          className="admin-orders-clear"
          onClick={handleClear}
          disabled={!status && !q}
        >
          Clear
        </button>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <div className="admin-orders-table-card">
          <table className="admin-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th className="admin-orders-num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totalCents = computeOrderTotal(order);
                return (
                  <tr key={order.order_number}>
                    <td>
                      <div className="admin-orders-order-cell">
                        <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
                        <span className="admin-orders-order-date">
                          {dateFormatter.format(new Date(order.created_at))}
                        </span>
                      </div>
                    </td>
                    <td className="admin-orders-email">{order.customer_email}</td>
                    <td>{order.product_name}</td>
                    <td className="admin-orders-num admin-orders-total">
                      {totalCents == null ? '—' : formatCents(totalCents)}
                    </td>
                    <td>
                      <span className={`order-history-badge ${STATUS_BADGE_CLASS[order.status] ?? 'status-active'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr className="admin-orders-empty-row">
                  <td colSpan={5}>No orders match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-orders-pager">
          <div className="admin-orders-pager-left">
            <label htmlFor="admin-orders-page-size">Rows per page</label>
            <select id="admin-orders-page-size" value={pageSize} onChange={handlePageSizeChange}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>

          <div className="admin-orders-pager-right">
            <button
              type="button"
              className="admin-orders-page-btn"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              &lsaquo;
            </button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button
                  key={p}
                  type="button"
                  className={`admin-orders-page-btn${p === page ? ' current' : ''}`}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ) : (
                <span key={p} className="admin-orders-page-ellipsis">
                  &hellip;
                </span>
              )
            )}
            <button
              type="button"
              className="admin-orders-page-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount}
              aria-label="Next page"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test file — still expected to fail on styling-independent assertions passing but rendering being unstyled**

Run: `cd frontend && npx vitest run src/pages/AdminOrdersPage.test.jsx`
Expected: PASS (the CSS in Step 5 is purely visual and doesn't affect any of these behavioral assertions — but do this run now to confirm the JSX/logic alone is already correct before touching CSS).

- [ ] **Step 5: Replace the `.admin-orders-*` rule block in `frontend/src/index.css`**

Find the block starting at `.admin-orders-page {` (currently line 7907) and ending right before `.admin-order-detail-page {` (currently line 7972). Replace that entire block (i.e. `.admin-orders-page`, `.admin-orders-toolbar`, `.admin-orders-toolbar select`, `.admin-orders-search`, `.admin-orders-search input`, `.admin-orders-table`, `.admin-orders-table th`/`td`, `.admin-orders-table th`, `.admin-orders-table tbody tr:last-child td`) with:

```css
.admin-orders-page {
  padding: 2rem 1.75rem 3rem;
  background: #0a0a0a;
  min-height: 100%;
  color: #fafafa;
}

.admin-orders-head {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  margin-bottom: 1.5rem;
}

.admin-orders-head h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.admin-orders-count {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #a1a1a1;
  background: #171717;
  border: 1px solid #434343;
  border-radius: var(--radius-pill);
  padding: 0.2rem 0.65rem;
}

.admin-orders-toolbar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.admin-orders-toolbar select {
  padding: 0.45rem 0.85rem;
  border: 1px solid #434343;
  border-radius: var(--radius-pill);
  background: #171717;
  color: #fafafa;
  font-size: 0.85rem;
}

.admin-orders-search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid #434343;
  border-radius: var(--radius-pill);
  background: #171717;
  flex: 1;
  max-width: 320px;
}

.admin-orders-search svg {
  flex-shrink: 0;
  color: #6b6b6b;
}

.admin-orders-search input {
  border: none;
  outline: none;
  background: transparent;
  color: #fafafa;
  width: 100%;
  font-size: 0.85rem;
}

.admin-orders-search input::placeholder {
  color: #6b6b6b;
}

.admin-orders-clear {
  background: none;
  border: 1px solid transparent;
  color: #a1a1a1;
  font-size: 0.85rem;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
}

.admin-orders-clear:hover:not(:disabled) {
  color: #fafafa;
}

.admin-orders-clear:disabled {
  opacity: 0.4;
  cursor: default;
}

.admin-orders-table-card {
  border: 1px solid #434343;
  border-radius: 10px;
  background: #171717;
  overflow: hidden;
  overflow-x: auto;
}

.admin-orders-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

.admin-orders-table th,
.admin-orders-table td {
  text-align: left;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid #434343;
  font-size: 0.86rem;
}

.admin-orders-table th {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #a1a1a1;
  background: #141414;
}

.admin-orders-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-orders-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.025);
}

.admin-orders-num {
  text-align: right;
}

.admin-orders-order-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.admin-orders-order-cell a {
  font-family: var(--font-mono);
  font-weight: 600;
  color: #fafafa;
  text-decoration: none;
}

.admin-orders-order-cell a:hover {
  text-decoration: underline;
}

.admin-orders-order-date {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: #a1a1a1;
}

.admin-orders-email {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: #fafafa;
}

.admin-orders-total {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #fafafa;
}

.admin-orders-empty-row td {
  padding: 3rem 1.1rem;
  text-align: center;
  color: #a1a1a1;
}

/* Pinned to the same hex/rgba values index.css's own
   :root[data-theme="dark"] .order-history-badge.* rules already use for
   these three classes - this page is always-dark regardless of the
   site's light/dark toggle, so it can't rely on that toggle's state to
   pick the right colors. */
.admin-orders-page .order-history-badge.status-delivered {
  background: rgba(6, 78, 59, 0.6);
  color: #34d399;
}

.admin-orders-page .order-history-badge.status-cancelled {
  background: rgba(76, 5, 25, 0.6);
  color: #fb7185;
}

.admin-orders-page .order-history-badge.status-active {
  background: rgba(23, 37, 84, 0.6);
  color: #60a5fa;
}

.admin-orders-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1rem;
  font-size: 0.82rem;
  color: #a1a1a1;
}

.admin-orders-pager-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.admin-orders-pager-left select {
  background: #171717;
  border: 1px solid #434343;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  color: #fafafa;
}

.admin-orders-pager-right {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-mono);
}

.admin-orders-page-btn {
  background: none;
  border: 1px solid #434343;
  color: #a1a1a1;
  min-width: 30px;
  height: 30px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.admin-orders-page-btn:hover:not(:disabled) {
  border-color: #a1a1a1;
  color: #fafafa;
}

.admin-orders-page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.admin-orders-page-btn.current {
  background: #fafafa;
  color: #101010;
  border-color: #fafafa;
  font-weight: 600;
}

.admin-orders-page-ellipsis {
  padding: 0 0.15rem;
  color: #6b6b6b;
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files (this CSS change touches no test-visible behavior, and no other page references the replaced class rules — `AdminOrderDetailPage` and `AdminProductsPage`/`AdminCustomersPage` use their own distinct `.admin-order-detail-*`/`.admin-product-*`/etc. classes, untouched here).

- [ ] **Step 7: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/AdminOrdersPage.jsx frontend/src/pages/AdminOrdersPage.test.jsx frontend/src/index.css
git commit -m "Dark-reskin the admin Orders page with a Total column and numbered pagination"
```

---

## Task 4: Frontend — dark `AdminNav` bar

**Files:**
- Modify: `frontend/src/index.css` (recolor the existing `.admin-nav-bar`, `.admin-nav-link`, `.admin-nav-email`, `.admin-nav-logout` rules, currently at lines 8063–8107 — `.admin-nav-root`, `.admin-nav-content`, and `.admin-products-new-link` are untouched)

**Interfaces:**
- Consumes: nothing new — `AdminNav.jsx`'s JSX and class names are unchanged, only the CSS values for existing selectors change.
- Produces: nothing consumed by other tasks.

This is CSS-only — no JSX changes, so `AdminNav.test.jsx` (which asserts link text/active-state/behavior, not colors) needs no changes and is expected to keep passing unmodified.

- [ ] **Step 1: Run the existing `AdminNav.test.jsx` to establish a baseline**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS (establishes these tests are color-agnostic before touching CSS).

- [ ] **Step 2: Recolor the nav bar rules in `frontend/src/index.css`**

Replace the four existing rules:

```css
.admin-nav-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.admin-nav-link {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
}

.admin-nav-link:hover {
  color: var(--color-text);
}

.admin-nav-link.active {
  background: var(--color-surface);
  color: var(--color-surface-text);
}
```

with:

```css
.admin-nav-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: #171717;
  border-bottom: 1px solid #434343;
}

.admin-nav-link {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-md);
  color: #a1a1a1;
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-decoration: none;
}

.admin-nav-link:hover {
  color: #fafafa;
}

.admin-nav-link.active {
  background: rgba(255, 255, 255, 0.07);
  color: #fafafa;
}
```

And replace:

```css
.admin-nav-email {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.admin-nav-logout {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
```

with:

```css
.admin-nav-email {
  font-size: var(--font-size-sm);
  color: #a1a1a1;
}

.admin-nav-logout {
  padding: 0.4rem 0.75rem;
  border: 1px solid #434343;
  border-radius: var(--radius-md);
  background: transparent;
  color: #a1a1a1;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.admin-nav-logout:hover {
  color: #fafafa;
  border-color: #a1a1a1;
}
```

`.admin-nav-root` (background `var(--color-page-bg)`), `.admin-nav-content` (`padding: 0`), and `.admin-products-new-link` are left exactly as they are — the Products/Customers content areas stay light this pass; only the nav strip itself and the Orders page (Task 3) go dark, so there's no seam within any single page.

- [ ] **Step 3: Run `AdminNav.test.jsx` again to confirm no regression**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS, unchanged from Step 1's baseline.

- [ ] **Step 4: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 5: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css
git commit -m "Dark-theme the admin nav bar to match the Orders page reskin"
```

---

## Post-plan manual verification (not a task — do this after all four tasks land)

Start the dev server and log in as admin, then confirm in the browser:
1. `/admin` (Orders) renders the full dark theme (page, toolbar, table, pager) with no light-theme flashes.
2. The nav bar reads dark on `/admin`, `/admin/products`, and `/admin/customers` — but Products/Customers page content stays light (expected, out of scope this pass).
3. Status filter and search both reset to page 1 and refetch.
4. Clicking a page number, Previous/Next, and changing rows-per-page all refetch correctly and update the `N–M of Total` label.
5. Total column shows a real computed dollar amount matching `computeOrderTotal`'s math for a known seeded order (e.g. `ORD-1002` → `$19.59`).
6. Clear resets both filters and is disabled when there's nothing to clear.
