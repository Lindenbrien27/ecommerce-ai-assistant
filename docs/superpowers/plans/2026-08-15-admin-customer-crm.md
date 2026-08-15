# Admin Customer Database (CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a searchable customer list and a per-customer detail view (contact info, aggregate stats, full order history), derived entirely from `orders.customer_email`, plus a minimal shared nav bar so the admin panel has a way to move between sections at all.

**Architecture:** A new `adminCustomerService.js` → `adminCustomerController.js` → `adminCustomerRoutes.js` layer, mounted at `/api/admin/customers` behind the existing `requireAdminAuth`, reusing `orderService.getOrdersByEmail` for per-customer order history instead of duplicating pagination logic. Two new frontend pages plus a small `AdminNav.jsx` layout component wrapping all four admin pages.

**Tech Stack:** Node/Express, `pg`, `node:test`. React/Vite frontend, Vitest + Testing Library, `react-router-dom`.

## Global Constraints

- No new migration — every field is derived from the existing `orders` table.
- A customer is defined as "whoever has at least one row in `orders`" — there is no separate customers table.
- Orders with no pricing data (`unit_price_cents IS NULL`) contribute `0` to `total_spent_cents`, not excluded from `order_count`.
- The customer list uses offset-based pagination (`page`/`limit`), not a cursor — customer cardinality grows far slower than order cardinality.
- The per-customer order history reuses `orderService.getOrdersByEmail` (existing, tested) directly — do not reimplement its keyset pagination.
- All new endpoints require `requireAdminAuth` (existing middleware, already mounted at the `/api/admin/orders` router level in `src/app.js` — mount `/api/admin/customers` the same way).
- Follow this codebase's existing test split: service-level tests mock `pool.query` directly; route-level tests use the `withServer`/`issueAdminToken` pattern (`test/adminOrders.test.js`); frontend tests render through `AdminAuthProvider` with a mocked `global.fetch`, same pattern as `AdminOrdersPage.test.jsx`/`AdminOrderDetailPage.test.jsx`.
- Reuse existing CSS classes wherever the layout matches (`.admin-orders-page`, `.admin-orders-toolbar`, `.admin-orders-search`, `.admin-orders-table`, `.admin-order-detail-page`, `.admin-order-detail-field`, `.admin-order-detail-address`, `.order-history-badge`, `.order-cards-load-more`, `.verify-error`) — only `AdminNav` needs genuinely new CSS.
- `pg` returns `COUNT`/`SUM` aggregate results as strings (bigint/numeric types) — `adminCustomerService.js` must convert `order_count`/`total_spent_cents` to numbers before returning, so the frontend never receives numeric-looking strings.
- Email route params (`:email`) contain `@`/`.` characters — every frontend fetch/link building a URL with a customer email must call `encodeURIComponent(email)`.

---

### Task 1: `adminCustomerService.js` — aggregate customer queries

**Files:**
- Create: `src/services/adminCustomerService.js`
- Test: `test/adminCustomerService.test.js`

**Interfaces:**
- Consumes: `pool` from `src/config/db.js`.
- Produces: `DEFAULT_PAGE_SIZE` (20), `MAX_PAGE_SIZE` (100), `getCustomers({ q, page, limit } = {})` → `Promise<{ customers: object[], hasMore: boolean }>` (each customer: `{ customer_email, order_count: number, total_spent_cents: number, last_order_at }`), `getCustomerSummary(email)` → `Promise<{ customer_email, order_count: number, total_spent_cents: number, last_order_at } | null>`.

- [ ] **Step 1: Write the failing tests**

```js
// test/adminCustomerService.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminCustomerService = require('../src/services/adminCustomerService');

test('getCustomers groups orders by customer_email with aggregate stats, converting string aggregates to numbers', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /GROUP BY customer_email/);
    assert.equal(params[0], null);
    return {
      rows: [
        {
          customer_email: 'jane.doe@example.com',
          order_count: '3',
          total_spent_cents: '15000',
          last_order_at: '2026-07-24T00:00:00Z',
        },
      ],
    };
  });

  const { customers, hasMore } = await adminCustomerService.getCustomers();
  assert.equal(customers.length, 1);
  assert.equal(customers[0].order_count, 3);
  assert.equal(typeof customers[0].order_count, 'number');
  assert.equal(customers[0].total_spent_cents, 15000);
  assert.equal(typeof customers[0].total_spent_cents, 'number');
  assert.equal(hasMore, false);
});

test('getCustomers filters by q using ILIKE', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /customer_email ILIKE \$1/);
    assert.equal(params[0], '%jane%');
    return { rows: [] };
  });

  await adminCustomerService.getCustomers({ q: 'jane' });
});

test('getCustomers reports hasMore when more rows remain beyond the page size', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[1], 3); // pageSize(2) + 1
    return {
      rows: [
        { customer_email: 'a@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-24T00:00:00Z' },
        { customer_email: 'b@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-23T00:00:00Z' },
        { customer_email: 'c@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-22T00:00:00Z' },
      ],
    };
  });

  const { customers, hasMore } = await adminCustomerService.getCustomers({ limit: 2 });
  assert.equal(customers.length, 2);
  assert.equal(hasMore, true);
});

test('getCustomers computes the correct OFFSET for page 2', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[2], 20); // (page 2 - 1) * pageSize(20)
    return { rows: [] };
  });

  await adminCustomerService.getCustomers({ page: 2 });
});

test('getCustomerSummary returns aggregate stats for one customer, converting string aggregates to numbers', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE customer_email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return {
      rows: [
        {
          customer_email: 'jane.doe@example.com',
          order_count: '5',
          total_spent_cents: '145000',
          last_order_at: '2026-07-24T00:00:00Z',
        },
      ],
    };
  });

  const summary = await adminCustomerService.getCustomerSummary('jane.doe@example.com');
  assert.equal(summary.order_count, 5);
  assert.equal(typeof summary.order_count, 'number');
  assert.equal(summary.total_spent_cents, 145000);
});

test('getCustomerSummary returns null for an email with no orders', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const summary = await adminCustomerService.getCustomerSummary('nobody@example.com');
  assert.equal(summary, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/adminCustomerService.test.js` (with the env vars from `package.json`'s `test` script)
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement `src/services/adminCustomerService.js`**

```js
// src/services/adminCustomerService.js
const { pool } = require('../config/db');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// pg returns bigint/numeric aggregate columns (COUNT, SUM) as strings, not
// JS numbers - converting here once means every caller (controller,
// frontend) can treat these as real numbers without re-parsing.
function normalizeAggregateRow(row) {
  return {
    ...row,
    order_count: Number(row.order_count),
    total_spent_cents: Number(row.total_spent_cents),
  };
}

async function getCustomers({ q = null, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const pageNum = Math.max(1, page);
  const offset = (pageNum - 1) * pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const { rows } = await pool.query(
    `SELECT customer_email,
            COUNT(*) AS order_count,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_spent_cents,
            MAX(created_at) AS last_order_at
     FROM orders
     WHERE ($1::text IS NULL OR customer_email ILIKE $1)
     GROUP BY customer_email
     ORDER BY last_order_at DESC, customer_email ASC
     LIMIT $2 OFFSET $3`,
    [searchTerm, pageSize + 1, offset]
  );

  const hasMore = rows.length > pageSize;
  const customers = (hasMore ? rows.slice(0, pageSize) : rows).map(normalizeAggregateRow);
  return { customers, hasMore };
}

async function getCustomerSummary(email) {
  const { rows } = await pool.query(
    `SELECT customer_email,
            COUNT(*) AS order_count,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_spent_cents,
            MAX(created_at) AS last_order_at
     FROM orders
     WHERE customer_email = $1
     GROUP BY customer_email`,
    [email]
  );
  return rows[0] ? normalizeAggregateRow(rows[0]) : null;
}

module.exports = { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, getCustomers, getCustomerSummary };
```

- [ ] **Step 4: Run to verify tests pass**

Run: `node --test test/adminCustomerService.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/services/adminCustomerService.js test/adminCustomerService.test.js
git commit -m "Add adminCustomerService: aggregate customer queries"
```

---

### Task 2: HTTP layer — controller + routes

**Files:**
- Create: `src/controllers/adminCustomerController.js`
- Create: `src/routes/adminCustomerRoutes.js`
- Modify: `src/app.js` (mount the new router)
- Test: `test/adminCustomers.test.js`

**Interfaces:**
- Consumes: `adminCustomerService.getCustomers`, `adminCustomerService.getCustomerSummary`, `adminCustomerService.DEFAULT_PAGE_SIZE` (Task 1); `orderService.getOrdersByEmail`, `orderService.InvalidCursorError` (existing, `src/services/orderService.js`); `requireAdminAuth` (existing, already imported in `src/app.js`); `logError` (existing, `src/utils/logger.js`).
- Produces: `GET /api/admin/customers?q=&page=&limit=`, `GET /api/admin/customers/:email?limit=&cursor=`, `GET /api/admin/customers/:email/orders?limit=&cursor=` — all mounted under `/api/admin/customers`, gated by `requireAdminAuth` at the router-mount level (same pattern as `/api/admin/orders`).

- [ ] **Step 1: Write the failing route-level tests**

```js
// test/adminCustomers.test.js
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

test('GET /api/admin/customers requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/customers returns the aggregated customer list', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      {
        customer_email: 'jane.doe@example.com',
        order_count: '3',
        total_spent_cents: '15000',
        last_order_at: '2026-07-24T00:00:00Z',
      },
    ],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.customers.length, 1);
    assert.equal(body.customers[0].order_count, 3);
  });
});

test('GET /api/admin/customers?limit=abc returns 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers?limit=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/customers/:email returns the customer summary plus first page of orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY customer_email/.test(sql)) {
      return {
        rows: [
          {
            customer_email: 'jane.doe@example.com',
            order_count: '2',
            total_spent_cents: '30000',
            last_order_at: '2026-07-24T00:00:00Z',
          },
        ],
      };
    }
    return { rows: [{ order_number: 'ORD-1001', customer_email: 'jane.doe@example.com' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.email, 'jane.doe@example.com');
    assert.equal(body.orderCount, 2);
    assert.equal(body.totalSpentCents, 30000);
    assert.equal(body.orders.length, 1);
  });
});

test('GET /api/admin/customers/:email returns 404 for an email with no orders', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('nobody@example.com')}`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 404);
  });
});

test("GET /api/admin/customers/:email/orders returns a page of that customer's orders", async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1002', customer_email: 'jane.doe@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}/orders`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1);
  });
});

test('GET /api/admin/customers/:email/orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}/orders`);
    assert.equal(res.status, 401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/adminCustomers.test.js`
Expected: FAIL — the routes don't exist yet.

- [ ] **Step 3: Implement `src/controllers/adminCustomerController.js`**

```js
// src/controllers/adminCustomerController.js
const adminCustomerService = require('../services/adminCustomerService');
const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');

function parseIntParam(raw, fallback) {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : NaN;
}

async function listCustomers(req, res) {
  const limit = parseIntParam(req.query.limit, adminCustomerService.DEFAULT_PAGE_SIZE);
  const page = parseIntParam(req.query.page, 1);
  if (Number.isNaN(limit) || Number.isNaN(page)) {
    return res.status(400).json({ error: 'limit and page must be integers.' });
  }

  try {
    const { customers, hasMore } = await adminCustomerService.getCustomers({
      q: req.query.q || null,
      page,
      limit,
    });
    res.json({ customers, hasMore });
  } catch (err) {
    logError('Admin customer list error', err);
    res.status(500).json({ error: 'Something went wrong looking up customers.' });
  }
}

async function getCustomer(req, res) {
  const limit = parseIntParam(req.query.limit, undefined);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  try {
    const summary = await adminCustomerService.getCustomerSummary(req.params.email);
    if (!summary) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const { orders, nextCursor } = await orderService.getOrdersByEmail(req.params.email, {
      limit,
      cursor: req.query.cursor,
    });
    res.json({
      email: summary.customer_email,
      orderCount: summary.order_count,
      totalSpentCents: summary.total_spent_cents,
      lastOrderAt: summary.last_order_at,
      orders,
      nextCursor,
    });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin customer detail error', err);
    res.status(500).json({ error: 'Something went wrong looking up that customer.' });
  }
}

async function getCustomerOrders(req, res) {
  const limit = parseIntParam(req.query.limit, undefined);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  try {
    const { orders, nextCursor } = await orderService.getOrdersByEmail(req.params.email, {
      limit,
      cursor: req.query.cursor,
    });
    res.json({ orders, nextCursor });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin customer orders error', err);
    res.status(500).json({ error: "Something went wrong looking up that customer's orders." });
  }
}

module.exports = { listCustomers, getCustomer, getCustomerOrders };
```

- [ ] **Step 4: Implement `src/routes/adminCustomerRoutes.js`**

```js
// src/routes/adminCustomerRoutes.js
const { Router } = require('express');
const { listCustomers, getCustomer, getCustomerOrders } = require('../controllers/adminCustomerController');

const router = Router();

router.get('/', listCustomers);
router.get('/:email', getCustomer);
router.get('/:email/orders', getCustomerOrders);

module.exports = router;
```

- [ ] **Step 5: Mount the router in `src/app.js`**

Add the require near the other route requires (`src/app.js:11`, right after `adminOrderRoutes`):

```js
const adminCustomerRoutes = require('./routes/adminCustomerRoutes');
```

Add the mount right after the existing `app.use('/api/admin/orders', requireAdminAuth, adminOrderRoutes);` (`src/app.js:101`):

```js
app.use('/api/admin/customers', requireAdminAuth, adminCustomerRoutes);
```

- [ ] **Step 6: Run to verify the tests pass**

Run: `node --test test/adminCustomers.test.js`
Expected: PASS (8 tests)

- [ ] **Step 7: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/controllers/adminCustomerController.js src/routes/adminCustomerRoutes.js src/app.js test/adminCustomers.test.js
git commit -m "Add admin customer list/detail/orders routes"
```

---

### Task 3: `AdminCustomersPage.jsx` — customer list

**Files:**
- Create: `frontend/src/pages/AdminCustomersPage.jsx`
- Test: `frontend/src/pages/AdminCustomersPage.test.jsx`

**Interfaces:**
- Consumes: `useAdminAuth` (existing, `../context/AdminAuthContext.jsx`); `formatCents` (existing, `../utils/pricing.js`); fetches `GET /api/admin/customers?q=&page=` (Task 2), reading `{ customers, hasMore }`.
- Produces: `export function AdminCustomersPage()` — consumed by `App.jsx` in Task 5 at `/admin/customers`, linking each row to `/admin/customers/:email` (Task 4).

This page is not yet wired into the app's router — that happens in Task 5. No new CSS is needed: it reuses `.admin-orders-page`, `.admin-orders-toolbar`, `.admin-orders-search`, `.admin-orders-table`, `.order-cards-load-more`, `.verify-error`, `.sr-only` — all already defined in `frontend/src/index.css` from the order-manager work.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/AdminCustomersPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminCustomersPage } from './AdminCustomersPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminCustomersPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/customers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          customers: [
            {
              customer_email: 'jane.doe@example.com',
              order_count: 3,
              total_spent_cents: 15000,
              last_order_at: '2026-07-24T00:00:00Z',
            },
          ],
          hasMore: false,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders customers returned from the API', async () => {
  renderPage();
  expect(await screen.findByText('jane.doe@example.com')).toBeInTheDocument();
  expect(screen.getByText('$150.00')).toBeInTheDocument();
});

it('links each row to the customer detail page with an encoded email', async () => {
  renderPage();
  await screen.findByText('jane.doe@example.com');
  expect(screen.getByRole('link', { name: /jane\.doe@example\.com/i })).toHaveAttribute(
    'href',
    '/admin/customers/jane.doe%40example.com'
  );
});

it('re-fetches with the search query when typed', async () => {
  renderPage();
  await screen.findByText('jane.doe@example.com');

  fireEvent.change(screen.getByLabelText(/search customers/i), { target: { value: 'jane' } });

  await waitFor(() => {
    const calledWithQuery = global.fetch.mock.calls.some(([url]) => String(url).includes('q=jane'));
    expect(calledWithQuery).toBe(true);
  });
});

it('shows Load more when hasMore is true and appends the next page', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).includes('page=2')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          customers: [
            {
              customer_email: 'john.smith@example.com',
              order_count: 1,
              total_spent_cents: 5000,
              last_order_at: '2026-07-20T00:00:00Z',
            },
          ],
          hasMore: false,
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        customers: [
          {
            customer_email: 'jane.doe@example.com',
            order_count: 3,
            total_spent_cents: 15000,
            last_order_at: '2026-07-24T00:00:00Z',
          },
        ],
        hasMore: true,
      }),
    });
  });

  renderPage();
  await screen.findByText('jane.doe@example.com');
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));

  expect(await screen.findByText('john.smith@example.com')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up customers.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminCustomersPage`
Expected: FAIL — `Failed to resolve import "./AdminCustomersPage.jsx"`

- [ ] **Step 3: Implement `AdminCustomersPage.jsx`**

```jsx
// frontend/src/pages/AdminCustomersPage.jsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ q, page }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page) params.set('page', String(page));
  return params.toString();
}

export function AdminCustomersPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Same "snapshot the request's own filters, drop a stale response"
  // pattern AdminOrdersPage.jsx's loadMore already uses.
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPage(1);
    fetch(`/api/admin/customers?${buildQuery({ q, page: 1 })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up customers.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCustomers(data.customers);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function loadMore() {
    const requestQ = q;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/customers?${buildQuery({ q, page: nextPage })}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong looking up customers.');
      }
      const data = await res.json();
      if (qRef.current !== requestQ) return;
      setCustomers((prev) => [...prev, ...data.customers]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (err) {
      if (qRef.current === requestQ) setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-orders-page">
      <h1>Customers</h1>

      <div className="admin-orders-toolbar">
        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-customers-search" className="sr-only">
            Search customers by email
          </label>
          <input
            id="admin-customers-search"
            type="text"
            placeholder="Search by email..."
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
              <th>Email</th>
              <th>Orders</th>
              <th>Total spent</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.customer_email}>
                <td>
                  <Link to={`/admin/customers/${encodeURIComponent(customer.customer_email)}`}>
                    {customer.customer_email}
                  </Link>
                </td>
                <td>{customer.order_count}</td>
                <td>{formatCents(customer.total_spent_cents)}</td>
                <td>{dateFormatter.format(new Date(customer.last_order_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!error && hasMore && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminCustomersPage`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminCustomersPage.jsx frontend/src/pages/AdminCustomersPage.test.jsx
git commit -m "Add AdminCustomersPage: searchable customer list"
```

---

### Task 4: `AdminCustomerDetailPage.jsx` — customer detail

**Files:**
- Create: `frontend/src/pages/AdminCustomerDetailPage.jsx`
- Test: `frontend/src/pages/AdminCustomerDetailPage.test.jsx`

**Interfaces:**
- Consumes: `useParams` from `react-router-dom`; `formatCents` (existing, `../utils/pricing.js`); fetches `GET /api/admin/customers/:email` and `GET /api/admin/customers/:email/orders?cursor=` (Task 2).
- Produces: `export function AdminCustomerDetailPage()` — consumed by `App.jsx` in Task 5 at `/admin/customers/:email`.

No new CSS: reuses `.admin-order-detail-page`, `.admin-order-detail-field`, `.admin-order-detail-address`, `.admin-orders-table`, `.order-history-badge`/`.status-*`, `.order-cards-load-more`, `.verify-error`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/AdminCustomerDetailPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminCustomerDetailPage } from './AdminCustomerDetailPage.jsx';

const CUSTOMER = {
  email: 'jane.doe@example.com',
  orderCount: 2,
  totalSpentCents: 30000,
  lastOrderAt: '2026-07-24T00:00:00Z',
  orders: [
    {
      order_number: 'ORD-1001',
      customer_email: 'jane.doe@example.com',
      product_name: 'Wireless Headphones',
      status: 'shipped',
      created_at: '2026-07-24T00:00:00Z',
      recipient_name: 'Jane Doe',
      address_line1: '482 Maple Street',
      address_line2: null,
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
    },
  ],
  nextCursor: null,
};

function renderPage(email = 'jane.doe@example.com') {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[`/admin/customers/${email}`]}>
        <Routes>
          <Route path="/admin/customers/:email" element={<AdminCustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === `/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`) {
      return Promise.resolve({ ok: true, json: async () => CUSTOMER });
    }
    if (url === `/api/admin/customers/${encodeURIComponent('nobody@example.com')}`) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Customer not found' }) });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders contact info from the most recent order', async () => {
  renderPage();
  expect(await screen.findByText('482 Maple Street')).toBeInTheDocument();
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
});

it('renders the aggregate stats', async () => {
  renderPage();
  await screen.findByText('482 Maple Street');
  expect(screen.getByText('$300.00')).toBeInTheDocument();
});

it('renders the order list linking to the order detail page', async () => {
  renderPage();
  await screen.findByText('482 Maple Street');
  expect(screen.getByRole('link', { name: /ORD-1001/i })).toHaveAttribute('href', '/admin/orders/ORD-1001');
});

it('shows a not-found message for an unknown customer', async () => {
  renderPage('nobody@example.com');
  expect(await screen.findByRole('alert')).toHaveTextContent(/customer not found/i);
});

it('loads more orders via the pagination endpoint', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === `/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`) {
      return Promise.resolve({ ok: true, json: async () => ({ ...CUSTOMER, nextCursor: 'abc123' }) });
    }
    if (String(url).includes('/orders?cursor=abc123')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            {
              order_number: 'ORD-1002',
              product_name: 'USB-C Cable',
              status: 'delivered',
              created_at: '2026-07-10T00:00:00Z',
            },
          ],
          nextCursor: null,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('482 Maple Street');
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));

  expect(await screen.findByText('ORD-1002')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminCustomerDetailPage`
Expected: FAIL — `Failed to resolve import "./AdminCustomerDetailPage.jsx"`

- [ ] **Step 3: Implement `AdminCustomerDetailPage.jsx`**

```jsx
// frontend/src/pages/AdminCustomerDetailPage.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Same status -> pill class map AdminOrdersPage.jsx already uses.
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

export function AdminCustomerDetailPage() {
  const { logout } = useAdminAuth();
  const { email } = useParams();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCustomer(null);
    fetch(`/api/admin/customers/${encodeURIComponent(email)}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that customer.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCustomer(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/customers/${encodeURIComponent(email)}/orders?cursor=${encodeURIComponent(customer.nextCursor)}`
      );
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong looking up that customer's orders.");
      }
      const data = await res.json();
      setCustomer((prev) => ({ ...prev, orders: [...prev.orders, ...data.orders], nextCursor: data.nextCursor }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !customer) {
    return (
      <div className="admin-order-detail-page">
        <p className="verify-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!customer) return null;

  // Contact info comes from the most recent order (first in the
  // already-DESC-sorted list) - there's no account-level contact info
  // anywhere in this schema beyond the email itself.
  const latest = customer.orders[0];

  return (
    <div className="admin-order-detail-page">
      <h1>{customer.email}</h1>

      {latest && latest.address_line1 && (
        <div className="admin-order-detail-address">
          <span>{latest.recipient_name}</span>
          <span>{latest.address_line1}</span>
          {latest.address_line2 && <span>{latest.address_line2}</span>}
          <span>
            {latest.city}, {latest.state} {latest.postal_code}
          </span>
          <span>{latest.country}</span>
        </div>
      )}

      <div className="admin-order-detail-field">
        <span>Orders</span>
        <span>{customer.orderCount}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Total spent</span>
        <span>{formatCents(customer.totalSpentCents)}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Last order</span>
        <span>{dateFormatter.format(new Date(customer.lastOrderAt))}</span>
      </div>

      <table className="admin-orders-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Product</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {customer.orders.map((order) => (
            <tr key={order.order_number}>
              <td>
                <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
              </td>
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

      {customer.nextCursor && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}

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

Run: `npm --prefix frontend test -- AdminCustomerDetailPage`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminCustomerDetailPage.jsx frontend/src/pages/AdminCustomerDetailPage.test.jsx
git commit -m "Add AdminCustomerDetailPage: contact info, stats, and order history"
```

---

### Task 5: `AdminNav.jsx` — shared admin nav, wire everything into `App.jsx`, manual verification

**Files:**
- Create: `frontend/src/components/AdminNav.jsx`
- Test: `frontend/src/components/AdminNav.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css` (append `AdminNav` styles)

**Interfaces:**
- Consumes: `useAdminAuth` (existing, exposes `{ email, logout }`); `NavLink`/`Outlet` from `react-router-dom`.
- Produces: `export function AdminNav()` — a layout route wrapping all four admin pages (`AdminOrdersPage`, `AdminOrderDetailPage`, `AdminCustomersPage` from Task 3, `AdminCustomerDetailPage` from Task 4) inside `App.jsx`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/AdminNav.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminNav } from './AdminNav.jsx';

function renderNav(initialPath = '/admin') {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') {
      return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    }
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });

  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AdminNav />}>
            <Route path="/admin" element={<p>Orders page</p>} />
            <Route path="/admin/customers" element={<p>Customers page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

it('renders both nav links and the signed-in admin email', async () => {
  renderNav();
  expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
});

it('marks the Orders link active on /admin, not the Customers link', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
});

it('marks the Customers link active on /admin/customers, not the Orders link', async () => {
  renderNav('/admin/customers');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /customers/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('renders the routed page content via Outlet', async () => {
  renderNav('/admin');
  expect(await screen.findByText('Orders page')).toBeInTheDocument();
});

it('logs out when the logout button is clicked', async () => {
  renderNav();
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: /log out/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/auth/logout', { method: 'POST' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminNav`
Expected: FAIL — `Failed to resolve import "./AdminNav.jsx"`

- [ ] **Step 3: Implement `AdminNav.jsx`**

```jsx
// frontend/src/components/AdminNav.jsx
import { NavLink, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();

  return (
    <div className="admin-nav-root">
      <nav className="admin-nav-bar" aria-label="Admin sections">
        <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
          Orders
        </NavLink>
        <NavLink
          to="/admin/customers"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Customers
        </NavLink>
        <span className="admin-nav-spacer" />
        <span className="admin-nav-email">{email}</span>
        <button type="button" className="admin-nav-logout" onClick={logout}>
          Log out
        </button>
      </nav>
      <div className="admin-nav-content">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminNav`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire everything into `frontend/src/App.jsx`**

Add two new lazy imports, right after the existing `AdminOrderDetailPage` lazy import (`frontend/src/App.jsx:43-45`):

```jsx
const AdminCustomersPage = lazy(() =>
  import('./pages/AdminCustomersPage.jsx').then((m) => ({ default: m.AdminCustomersPage }))
);
const AdminCustomerDetailPage = lazy(() =>
  import('./pages/AdminCustomerDetailPage.jsx').then((m) => ({ default: m.AdminCustomerDetailPage }))
);
```

`AdminNav` is a shared layout component, not a lazily-loaded page — import it plainly at the top of the file, the same way the customer-facing `Layout` is imported (`frontend/src/App.jsx:7`):

```jsx
import { AdminNav } from './components/AdminNav.jsx';
```

Replace the `/admin/*` route branch (`frontend/src/App.jsx:100-113`):

```jsx
            <Route
              path="/admin/*"
              element={
                <AdminAuthProvider>
                  <Outlet />
                </AdminAuthProvider>
              }
            >
              <Route path="login" element={<AdminLoginPage />} />
              <Route element={<AdminProtectedRoute />}>
                <Route element={<AdminNav />}>
                  <Route index element={<AdminOrdersPage />} />
                  <Route path="orders/:orderNumber" element={<AdminOrderDetailPage />} />
                  <Route path="customers" element={<AdminCustomersPage />} />
                  <Route path="customers/:email" element={<AdminCustomerDetailPage />} />
                </Route>
              </Route>
            </Route>
```

`AdminNav` sits inside `AdminProtectedRoute`, not outside it — the nav (and its `useAdminAuth()`-driven email/logout) should only ever render for a signed-in admin; `/admin/login` stays outside it, unchanged.

- [ ] **Step 6: Add `AdminNav` styles to `frontend/src/index.css`**

Append after the existing `.admin-order-detail-downloads` rule (added by the invoice/shipping-label work):

```css
.admin-nav-root {
  min-height: 100vh;
  background: var(--color-page-bg);
}

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

.admin-nav-spacer {
  flex: 1;
}

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

.admin-nav-content {
  padding: 0;
}
```

- [ ] **Step 7: Run both full test suites**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

Run:
```
ANTHROPIC_API_KEY=test-key-for-ci DATABASE_URL=postgresql://test:test@localhost:5432/test JWT_SECRET=test-secret-for-ci RATE_LIMIT_MAX=20 RATE_LIMIT_WINDOW_MS=60000 RATE_LIMIT_ORDERS_MAX=20 RATE_LIMIT_ORDERS_WINDOW_MS=60000 RATE_LIMIT_AUTH_MAX=20 RATE_LIMIT_AUTH_WINDOW_MS=60000 RATE_LIMIT_ADMIN_LOGIN_MAX=20 RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS=60000 LOG_LEVEL=silent npm test
```
Expected: PASS, no regressions

- [ ] **Step 8: Manual verification in the browser**

Start both servers if not already running, sign in at `/admin/login`, and confirm:
- The nav bar appears on every admin page (Orders, an order detail page, Customers, a customer detail page) with the correct tab highlighted and the signed-in admin's email visible.
- `/admin/customers` shows a real customer list derived from the seeded orders, with plausible order counts and total-spent figures.
- Clicking a customer navigates to `/admin/customers/:email` and shows their real backfilled shipping address (from the earlier invoice/shipping-label work), correct aggregate stats, and their real order list.
- Clicking an order number from the customer detail page navigates to the existing `/admin/orders/:orderNumber` page.
- The search box on `/admin/customers` narrows the list by email substring.
- Clicking "Log out" from the nav bar signs out and redirects to `/admin/login`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/AdminNav.jsx frontend/src/components/AdminNav.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add AdminNav and wire the customer pages into the admin router"
```

---

## Post-Plan Notes (not part of this plan's scope)

- No real `customers` table, no customer editing, no merging duplicate emails — this is a read-only, derived view.
- Product Variants & Inventory Guard remains the one not-yet-built Phase 2 sub-project.
- RBAC/permissions, Product Management, and Store & Payment Settings remain separate, not-yet-built Phase 1 sub-projects.
