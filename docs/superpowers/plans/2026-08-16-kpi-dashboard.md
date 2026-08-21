# KPI Dashboard & Basic Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a single at-a-glance dashboard — total revenue, total orders, average order value, and a top-5-products-by-revenue table — backed by a new read-only admin endpoint over the existing `orders` table.

**Architecture:** One new backend triad (`adminDashboardService`/`adminDashboardController`/`adminDashboardRoutes`), mounted the same way the three existing admin routers already are. One new frontend page (`AdminDashboardPage.jsx`) added as a fourth `AdminNav` tab and a new `/admin/dashboard` route. No new tables, no migration. Full design rationale: `docs/superpowers/specs/2026-08-16-kpi-dashboard-design.md`.

**Tech Stack:** Express + `pg` (`pool.query`), React (no new dependencies), `node:test` for backend tests, Vitest + Testing Library for frontend tests.

## Global Constraints

- All aggregates exclude `status = 'cancelled'` orders (they generated no actual revenue) — same convention `adminCustomerService.js`'s `TOTAL_SPENT_SQL` already established.
- `orders` has no `product_id` — "top products" is computed by `GROUP BY product_name` over `orders`, never by joining to the `products` table.
- `average_order_value_cents` is computed in JS from the two already-fetched aggregate numbers, guarded so `total_orders === 0` yields `0`, never `NaN`/`Infinity` — not computed in SQL.
- Top products list is a fixed top 5, ranked by revenue descending with `product_name ASC` as a deterministic tiebreak. No pagination, no "see all."
- This page must **not** repeat the CSS-bleed-through mistake found and fixed in the Orders/Products dark reskins: it gets its own dedicated `.admin-dashboard-*` CSS classes, styled with this app's existing theme-adaptive `var(--color-*)`/`var(--space-*)`/`var(--radius-*)` tokens — **not** the fixed dark hex palette, and **not** any `.admin-orders-*`/`.admin-products-*` class name, even though those currently render dark.
- No time-range filter (all-time only), no charts/trend lines, no order-status breakdown, no low-stock alerts — all explicitly out of scope for this pass.
- `/admin` itself stays the Orders list — Dashboard is an additional tab, not a new landing page.

---

## Task 1: Backend — `GET /api/admin/dashboard`

**Files:**
- Create: `src/services/adminDashboardService.js`
- Create: `src/controllers/adminDashboardController.js`
- Create: `src/routes/adminDashboardRoutes.js`
- Modify: `src/app.js`
- Test: `test/adminDashboardService.test.js`
- Test: `test/adminDashboard.test.js`

**Interfaces:**
- Produces: `getDashboardStats()` → `Promise<{ total_revenue_cents: number, total_orders: number, average_order_value_cents: number, top_products: Array<{ product_name: string, product_icon: string|null, revenue_cents: number, units_sold: number }> }>`. Task 2's frontend depends on this exact response shape from `GET /api/admin/dashboard`.

- [ ] **Step 1: Write the failing test file `test/adminDashboardService.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminDashboardService = require('../src/services/adminDashboardService');

test('getDashboardStats computes total revenue, order count, and AOV, excluding cancelled orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /status <> 'cancelled'/);
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '2', total_revenue_cents: '30000' }] };
  });

  const stats = await adminDashboardService.getDashboardStats();
  assert.equal(stats.total_orders, 2);
  assert.equal(typeof stats.total_orders, 'number');
  assert.equal(stats.total_revenue_cents, 30000);
  assert.equal(typeof stats.total_revenue_cents, 'number');
  assert.equal(stats.average_order_value_cents, 15000);
});

test('getDashboardStats returns 0 average order value (not NaN) when there are no orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '0', total_revenue_cents: null }] };
  });

  const stats = await adminDashboardService.getDashboardStats();
  assert.equal(stats.total_orders, 0);
  assert.equal(stats.total_revenue_cents, 0);
  assert.equal(stats.average_order_value_cents, 0);
});

test('getDashboardStats ranks top_products by revenue descending, capped at 5, tiebroken by product_name', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) {
      assert.match(sql, /ORDER BY revenue_cents DESC, product_name ASC/);
      assert.match(sql, /LIMIT 5/);
      return {
        rows: [
          { product_name: '27" 4K Monitor', product_icon: 'monitor', revenue_cents: '189746', units_sold: '3' },
          { product_name: 'Ergonomic Office Chair', product_icon: 'chair', revenue_cents: '74997', units_sold: '3' },
        ],
      };
    }
    return { rows: [{ total_orders: '10', total_revenue_cents: '500000' }] };
  });

  const { top_products } = await adminDashboardService.getDashboardStats();
  assert.equal(top_products.length, 2);
  assert.equal(top_products[0].product_name, '27" 4K Monitor');
  assert.equal(top_products[0].revenue_cents, 189746);
  assert.equal(typeof top_products[0].revenue_cents, 'number');
  assert.equal(top_products[0].units_sold, 3);
  assert.equal(typeof top_products[0].units_sold, 'number');
  assert.equal(top_products[0].product_icon, 'monitor');
});

test('getDashboardStats returns an empty top_products list when there are no orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '0', total_revenue_cents: null }] };
  });

  const { top_products } = await adminDashboardService.getDashboardStats();
  assert.deepEqual(top_products, []);
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `node --test test/adminDashboardService.test.js`
Expected: FAIL — `src/services/adminDashboardService.js` doesn't exist yet.

- [ ] **Step 3: Create `src/services/adminDashboardService.js`**

```javascript
const { pool } = require('../config/db');

// Excludes cancelled orders - they never generated real revenue. Same
// convention adminCustomerService.js's TOTAL_SPENT_SQL already
// established for per-customer totals, applied here at the whole-table
// level.
async function getDashboardStats() {
  const statsResult = await pool.query(
    `SELECT COUNT(*) AS total_orders,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_revenue_cents
     FROM orders
     WHERE status <> 'cancelled'`
  );
  const totalOrders = Number(statsResult.rows[0].total_orders);
  // SUM() over zero matching rows returns SQL NULL, not 0 - Number(null)
  // is 0 in JS, so this already comes out correct without an explicit
  // fallback.
  const totalRevenueCents = Number(statsResult.rows[0].total_revenue_cents);
  const averageOrderValueCents = totalOrders === 0 ? 0 : Math.round(totalRevenueCents / totalOrders);

  // orders has no product_id (see this plan's own Global Constraints) -
  // "top products" is grouped by the free-text product_name snapshot
  // captured at purchase time, not joined to the products table.
  // product_icon is wrapped in MAX() because it's non-aggregated but
  // stable per product_name in this app's data - a mechanical way to
  // carry a single-valued column through GROUP BY without adding it to
  // the grouping key.
  const topProductsResult = await pool.query(
    `SELECT product_name,
            MAX(product_icon) AS product_icon,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS revenue_cents,
            COUNT(*) AS units_sold
     FROM orders
     WHERE status <> 'cancelled'
     GROUP BY product_name
     ORDER BY revenue_cents DESC, product_name ASC
     LIMIT 5`
  );
  const topProducts = topProductsResult.rows.map((row) => ({
    product_name: row.product_name,
    product_icon: row.product_icon,
    revenue_cents: Number(row.revenue_cents),
    units_sold: Number(row.units_sold),
  }));

  return {
    total_revenue_cents: totalRevenueCents,
    total_orders: totalOrders,
    average_order_value_cents: averageOrderValueCents,
    top_products: topProducts,
  };
}

module.exports = { getDashboardStats };
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `node --test test/adminDashboardService.test.js`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Write the failing test file `test/adminDashboard.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

test('GET /api/admin/dashboard requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/dashboard returns the aggregate stats and top products', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) {
      return { rows: [{ product_name: 'Headphones', product_icon: 'headphones', revenue_cents: '16798', units_sold: '1' }] };
    }
    return { rows: [{ total_orders: '1', total_revenue_cents: '16798' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_orders, 1);
    assert.equal(body.total_revenue_cents, 16798);
    assert.equal(body.average_order_value_cents, 16798);
    assert.equal(body.top_products.length, 1);
    assert.equal(body.top_products[0].product_name, 'Headphones');
  });
});

test('GET /api/admin/dashboard returns 500 with a generic message on a query failure', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('boom');
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.match(body.error, /something went wrong/i);
  });
});
```

- [ ] **Step 6: Run the test file to confirm it fails**

Run: `node --test test/adminDashboard.test.js`
Expected: FAIL — no route exists yet (404s, not the expected 401/200/500).

- [ ] **Step 7: Create `src/controllers/adminDashboardController.js`**

```javascript
const adminDashboardService = require('../services/adminDashboardService');
const { logError } = require('../utils/logger');

async function getDashboard(req, res) {
  try {
    const stats = await adminDashboardService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    logError('Admin dashboard error', err);
    res.status(500).json({ error: 'Something went wrong loading the dashboard.' });
  }
}

module.exports = { getDashboard };
```

- [ ] **Step 8: Create `src/routes/adminDashboardRoutes.js`**

```javascript
const { Router } = require('express');
const { getDashboard } = require('../controllers/adminDashboardController');

const router = Router();

router.get('/', getDashboard);

module.exports = router;
```

- [ ] **Step 9: Mount the route in `src/app.js`**

Find this line (among the other admin route imports near the top of the file):

```javascript
const adminProductRoutes = require('./routes/adminProductRoutes');
```

Add immediately after it:

```javascript
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
```

Find this line (among the other admin route mounts):

```javascript
app.use('/api/admin/products', requireAdminAuth, adminProductRoutes);
```

Add immediately after it:

```javascript
app.use('/api/admin/dashboard', requireAdminAuth, adminDashboardRoutes);
```

- [ ] **Step 10: Run the test file to confirm it passes**

Run: `node --test test/adminDashboard.test.js`
Expected: PASS, all 3 tests.

- [ ] **Step 11: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 12: Commit**

```bash
git add src/services/adminDashboardService.js src/controllers/adminDashboardController.js src/routes/adminDashboardRoutes.js src/app.js test/adminDashboardService.test.js test/adminDashboard.test.js
git commit -m "Add a read-only admin dashboard endpoint: revenue, order count, AOV, and top products"
```

---

## Task 2: Frontend — `AdminDashboardPage` + nav tab + route

**Files:**
- Create: `frontend/src/pages/AdminDashboardPage.jsx`
- Create: `frontend/src/pages/AdminDashboardPage.test.jsx`
- Modify: `frontend/src/components/AdminNav.jsx`
- Modify: `frontend/src/components/AdminNav.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `GET /api/admin/dashboard` → `{ total_revenue_cents, total_orders, average_order_value_cents, top_products }` (Task 1). `formatCents(cents)` from `../utils/pricing.js` (existing, unchanged). `<ProductImage icon={...} size="sm" />` from `../components/ProductImage.jsx` (existing, unchanged) — no dark-theme pin needed here (unlike Orders/Products), since this page uses the same theme-adaptive tokens `ProductImage`'s own CSS already uses, so they naturally match instead of clashing.
- Produces: nothing consumed by other tasks — this is a leaf page component plus a small, additive change to the shared `AdminNav`.

- [ ] **Step 1: Write the failing test file `frontend/src/pages/AdminDashboardPage.test.jsx`**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminDashboardPage } from './AdminDashboardPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

// Every value here is deliberately distinct from every other value (3
// orders, not 1, so total revenue != average order value; the one
// product's revenue/units differ from both) - a fixture where two of
// these coincidentally matched would make screen.getByText ambiguous
// (multiple elements sharing the same text), since nothing here is
// scoped to one card or table cell.
const STATS = {
  total_revenue_cents: 50000,
  total_orders: 3,
  average_order_value_cents: 16667,
  top_products: [
    { product_name: 'Wireless Noise-Cancelling Headphones', product_icon: 'headphones', revenue_cents: 16798, units_sold: 2 },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/dashboard') return Promise.resolve({ ok: true, json: async () => STATS });
    return Promise.resolve({ ok: false });
  });
});

it('renders the three stat cards with formatted values', async () => {
  renderPage();
  expect(await screen.findByText('$500.00')).toBeInTheDocument(); // total revenue
  expect(screen.getByText('3')).toBeInTheDocument(); // total orders
  expect(screen.getByText('$166.67')).toBeInTheDocument(); // average order value (50000 / 3, rounded)
});

it('renders the top products table', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument(); // units sold
  expect(screen.getByText('$167.98')).toBeInTheDocument(); // product revenue
});

it('shows the empty state when there are no orders yet', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/dashboard') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ total_revenue_cents: 0, total_orders: 0, average_order_value_cents: 0, top_products: [] }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading the dashboard.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the dashboard fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (url === '/api/admin/dashboard') {
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
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/pages/AdminDashboardPage.test.jsx`
Expected: FAIL — `./AdminDashboardPage.jsx` doesn't exist yet.

- [ ] **Step 3: Create `frontend/src/pages/AdminDashboardPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

export function AdminDashboardPage() {
  const { logout } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // Fetches once on mount - unlike AdminOrdersPage/AdminProductsPage,
  // this page has no filters/pagination params to react to.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/admin/dashboard')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading the dashboard.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="verify-error" role="alert">
        {error}
      </p>
    );
  }

  if (!stats) return null;

  return (
    <div className="admin-dashboard-page">
      <h1>Dashboard</h1>

      <div className="admin-dashboard-stats">
        <div className="admin-dashboard-stat-card">
          <p className="admin-dashboard-stat-label">Total Revenue</p>
          <p className="admin-dashboard-stat-value">{formatCents(stats.total_revenue_cents)}</p>
        </div>
        <div className="admin-dashboard-stat-card">
          <p className="admin-dashboard-stat-label">Total Orders</p>
          <p className="admin-dashboard-stat-value">{stats.total_orders}</p>
        </div>
        <div className="admin-dashboard-stat-card">
          <p className="admin-dashboard-stat-label">Average Order Value</p>
          <p className="admin-dashboard-stat-value">{formatCents(stats.average_order_value_cents)}</p>
        </div>
      </div>

      <div className="admin-dashboard-top-products">
        <h2>Top Products</h2>
        <table className="admin-dashboard-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Units Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {stats.top_products.map((product) => (
              <tr key={product.product_name}>
                <td className="admin-dashboard-product-cell">
                  <ProductImage icon={product.product_icon} size="sm" />
                  {product.product_name}
                </td>
                <td>{product.units_sold}</td>
                <td>{formatCents(product.revenue_cents)}</td>
              </tr>
            ))}
            {stats.top_products.length === 0 && (
              <tr>
                <td colSpan={3} className="admin-dashboard-empty-row">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/pages/AdminDashboardPage.test.jsx`
Expected: PASS, all 5 tests (styling isn't added until Step 8, but none of these assertions depend on CSS).

- [ ] **Step 5: Update `frontend/src/components/AdminNav.test.jsx` for the new tab**

Replace the whole file:

```jsx
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
            <Route path="/admin/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/admin/customers" element={<p>Customers page</p>} />
            <Route path="/admin/orders/:orderNumber" element={<p>Order detail page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

it('renders all nav links and the signed-in admin email', async () => {
  renderNav();
  expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
});

it('marks the Orders link active on /admin, not the Dashboard or Customers link', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
});

it('marks the Dashboard link active on /admin/dashboard', async () => {
  renderNav('/admin/dashboard');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('marks the Customers link active on /admin/customers, not the Orders link', async () => {
  renderNav('/admin/customers');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /customers/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('keeps the Orders link active on an order detail page', async () => {
  renderNav('/admin/orders/ORD-1001');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
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

- [ ] **Step 6: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: FAIL — no Dashboard link exists yet.

- [ ] **Step 7: Add the Dashboard tab to `frontend/src/components/AdminNav.jsx`**

Replace the whole file:

```jsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  // NavLink's own isActive still contributes an "active" class even when
  // className is a plain string (not a function) - it just concatenates.
  // Without `end` here, that internal match is a startsWith("/admin"),
  // which would also match /admin/customers. Keeping `end` pins NavLink's
  // own match to exactly "/admin"; ordersActive below is what extends
  // highlighting to /admin/orders/* detail pages on top of that.
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  return (
    <div className="admin-nav-root">
      <nav className="admin-nav-bar" aria-label="Admin sections">
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink to="/admin" end className={`admin-nav-link${ordersActive ? ' active' : ''}`}>
          Orders
        </NavLink>
        <NavLink
          to="/admin/products"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Products
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

- [ ] **Step 8: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS, all 7 tests.

- [ ] **Step 9: Add the route in `frontend/src/App.jsx`**

Find this block (the lazy-loaded admin page imports):

```jsx
const AdminOrdersPage = lazy(() =>
  import('./pages/AdminOrdersPage.jsx').then((m) => ({ default: m.AdminOrdersPage }))
);
```

Add immediately before it:

```jsx
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage.jsx').then((m) => ({ default: m.AdminDashboardPage }))
);
```

Find this route:

```jsx
<Route index element={<AdminOrdersPage />} />
```

Add immediately after it:

```jsx
<Route path="dashboard" element={<AdminDashboardPage />} />
```

- [ ] **Step 10: Add the `.admin-dashboard-*` CSS block to `frontend/src/index.css`**

Add this block anywhere sensible (e.g. right after the existing `.admin-nav-content { padding: 0; }` rule, or any other convenient spot — it doesn't need to sit next to any particular existing rule, since it shares no selectors with anything else):

```css
.admin-dashboard-page {
  padding: var(--space-4);
}

.admin-dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  margin: var(--space-3) 0 var(--space-4);
}

.admin-dashboard-stat-card {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
}

.admin-dashboard-stat-label {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.admin-dashboard-stat-value {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.admin-dashboard-top-products h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-base);
}

.admin-dashboard-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.admin-dashboard-table th,
.admin-dashboard-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.admin-dashboard-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.admin-dashboard-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-dashboard-product-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-dashboard-empty-row {
  text-align: center;
  color: var(--color-text-muted);
}
```

- [ ] **Step 11: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files — in particular confirm `AdminOrdersPage.test.jsx`/`AdminProductsPage.test.jsx` are still green, proving the new CSS didn't collide with anything.

- [ ] **Step 12: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/AdminDashboardPage.jsx frontend/src/pages/AdminDashboardPage.test.jsx frontend/src/components/AdminNav.jsx frontend/src/components/AdminNav.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add the admin Dashboard page: stat cards, top products, and a new nav tab"
```

---

## Post-plan manual verification (not a task — do this after both tasks land)

Start the dev server and log in as admin, then confirm in the browser:
1. A "Dashboard" tab appears first in the admin nav, before Orders; clicking it loads `/admin/dashboard` and highlights correctly; other tabs still highlight correctly on their own pages.
2. The three stat cards show real numbers matching the seeded order data (42 orders total across all seed migrations, excluding the 2 cancelled ones).
3. The top-products table shows real product names ranked by revenue, with recognizable icons.
4. The page renders in the app's normal light/adaptive theme, not dark — confirms this pass deliberately didn't repeat the dark-reskin work.
