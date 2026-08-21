# Admin Products Page Dark Reskin + List Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the admin Products page (`/admin/products`) to the same fixed dark theme as the admin Orders page, backed by a new paginated `GET /api/admin/products` endpoint, with its own dedicated CSS namespace (fixing a real bug where it currently inherits Orders' dark styling by accident through shared class names).

**Architecture:** One new backend endpoint (`adminProductService.getAdminProducts` + controller + route) — a new admin-only, paginated products list, entirely separate from the public unpaginated `GET /api/products` (which the storefront's `ProductsContext`/`ShopPage`/`BagPage`/etc. need untouched, since they require the *full* catalog, not a page of it). One frontend rewrite of `AdminProductsPage.jsx` moving it off the shared `.admin-orders-*` CSS classes onto its own `.admin-products-*` classes, styled with the same fixed dark palette Orders already established. This was approved as an artifact mockup first, not a written spec doc — this plan is the direct handoff from that approved design.

**Tech Stack:** Express + `pg` (`pool.query`), React (no new dependencies), `node:test` for backend tests, Vitest + Testing Library for frontend tests.

## Global Constraints

- Dark palette is the same fixed hex values already used on the Orders page, not tied to the app's `--color-*` light/dark toggle: background `#0a0a0a`, surface `#171717`, recessed surface `#141414`, border `#434343`, primary text `#fafafa`, secondary text `#a1a1a1`, muted `#6b6b6b`.
- Stock badge colors reuse this app's existing semantic dark-mode palette verbatim (the same success/warning/error tokens the Orders page's status badges already pin): success `#34d399`/`rgba(6, 78, 59, 0.6)`, warning `#fbbf24`/`rgba(69, 26, 3, 0.6)`, error `#fb7185`/`rgba(76, 5, 25, 0.6)`.
- Interactive-element accent (current page button, primary "New Product" button, focus states) is monochrome near-white-on-dark (`#fafafa` bg / `#101010` text) — no invented colored accent. Every focusable element inside `.admin-products-page` must resolve to a visible `#fafafa` outline on focus regardless of the site's own theme state (the Orders page needed two fix rounds to get this right — apply that lesson from the start here: don't rely solely on a universal `*:focus-visible` rule if a higher-specificity site-wide rule could still win for a specific element type).
- **Root-cause fix, not a patch:** `AdminProductsPage.jsx` currently renders `className="admin-orders-page"` and reuses `.admin-orders-toolbar`/`.admin-orders-search`/`.admin-orders-table` — the exact classes the Orders reskin plan dark-styled. This plan replaces every one of those class names on this page with new, dedicated `.admin-products-*` classes and adds fresh CSS rules for them. Do not add any override or exception to the existing `.admin-orders-*` rules — those must be left completely untouched (they're still relied on by `AdminOrdersPage.jsx` and, deliberately for now, `AdminCustomersPage.jsx`).
- Scope is the Products **list** page only. `AdminProductFormPage.jsx` (the create/edit form) and its CSS (`.admin-product-form-page`, `.admin-product-delete-btn`, etc.) are explicitly untouched — this plan does not touch the create/edit experience, only the list/table view.
- No checkboxes, no vendor column, no variant count, no Export button — none are backed by real data or functionality in this app. "New Product" **is** kept and restyled (unlike Orders' banned "New order" button) because it's already a real, working feature (`Link to="/admin/products/new"`).
- Stock badge thresholds: `stock_quantity <= 0` → Out of Stock, `stock_quantity < 10` → Low Stock, otherwise → In Stock. No product in the current seed data is Out of Stock — that state exists in code but isn't exercised by today's data, same situation Orders had with some of its status badges.
- Rows-per-page options: 10 / 25 / 50, default 10 (matching Orders, even though the current catalog is only 6 products).
- The category filter dropdown's option list always reflects every distinct category in the whole `products` table, not just the categories present in the current filtered/paginated result — so picking a category never removes other categories from the dropdown itself.
- `GET /api/admin/products` is a **new** endpoint — it does not modify, replace, or share code with `GET /api/products` (`src/services/productService.js`), `src/controllers/productController.js`, or `src/routes/productRoutes.js`, all of which must remain byte-for-byte unmodified by this plan.

---

## Task 1: Backend — new paginated `GET /api/admin/products` endpoint

**Files:**
- Modify: `src/services/adminProductService.js`
- Modify: `src/controllers/adminProductController.js`
- Modify: `src/routes/adminProductRoutes.js`
- Test: `test/adminProductService.test.js`
- Test: `test/adminProducts.test.js`

**Interfaces:**
- Consumes: `DEFAULT_PAGE_SIZE` (20), `MAX_PAGE_SIZE` (100) from `src/services/orderService.js` (already exported there, already reused the same way by `src/services/adminOrderService.js`).
- Produces: `getAdminProducts({ q = null, category = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {})` → `Promise<{ products: object[], total: number, page: number, pageSize: number, categories: string[] }>`. `categories` is the full, unfiltered list of distinct `category` values across the whole table — Task 2's frontend depends on this exact field existing on every response, filtered or not.

- [ ] **Step 1: Add the new tests to `test/adminProductService.test.js`**

Append these tests to the end of the existing file (the existing `createProduct`/`updateProduct`/`deleteProduct` tests above them are untouched):

```javascript
function mockProductsQuery(overrides = {}) {
  const { categories = [], total = 0, rows = [] } = overrides;
  return async (sql) => {
    if (/DISTINCT category/.test(sql)) return { rows: categories.map((c) => ({ category: c })) };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: String(total) }] };
    return { rows };
  };
}

test('getAdminProducts returns products, total, page, pageSize, and the full category list', async (t) => {
  t.mock.method(
    pool,
    'query',
    mockProductsQuery({
      categories: ['Audio', 'Displays'],
      total: 2,
      rows: [{ slug: 'headphones' }, { slug: 'monitor' }],
    })
  );

  const result = await adminProductService.getAdminProducts();
  assert.equal(result.products.length, 2);
  assert.equal(result.total, 2);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.deepEqual(result.categories, ['Audio', 'Displays']);
});

test('getAdminProducts filters by category', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/DISTINCT category/.test(sql)) return { rows: [] };
    assert.match(sql, /category = \$1/);
    assert.equal(params[0], 'Audio');
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminProductService.getAdminProducts({ category: 'Audio' });
});

test('getAdminProducts searches name, sku, and category with q', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/DISTINCT category/.test(sql)) return { rows: [] };
    assert.match(sql, /name ILIKE/);
    assert.match(sql, /sku ILIKE/);
    assert.match(sql, /category ILIKE/);
    assert.ok(params.includes('%keyboard%'));
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminProductService.getAdminProducts({ q: 'keyboard' });
});

test('getAdminProducts paginates using LIMIT/OFFSET derived from page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/DISTINCT category/.test(sql)) return { rows: [] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '5' }] };
    assert.match(sql, /LIMIT \$3 OFFSET \$4/);
    assert.deepEqual(params.slice(2), [2, 2]); // pageSize 2, page 2 -> offset (2-1)*2 = 2
    return { rows: [{ slug: 'a' }, { slug: 'b' }] };
  });

  const { products, total, page, pageSize } = await adminProductService.getAdminProducts({ page: 2, pageSize: 2 });
  assert.equal(products.length, 2);
  assert.equal(total, 5);
  assert.equal(page, 2);
  assert.equal(pageSize, 2);
});

test('getAdminProducts clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/DISTINCT category/.test(sql)) return { rows: [] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '0' }] };
    assert.deepEqual(params.slice(2), [100, 0]); // pageSize clamped 999 -> 100, page clamped 0 -> 1 -> offset 0
    return { rows: [] };
  });

  const { page, pageSize } = await adminProductService.getAdminProducts({ page: 0, pageSize: 999 });
  assert.equal(page, 1);
  assert.equal(pageSize, 100);
});

test('getAdminProducts returns the full category list regardless of the active category filter', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/DISTINCT category/.test(sql)) {
      assert.doesNotMatch(sql, /WHERE/);
      return { rows: [{ category: 'Audio' }, { category: 'Office' }, { category: 'Sneakers' }] };
    }
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  const { categories } = await adminProductService.getAdminProducts({ category: 'Audio' });
  assert.deepEqual(categories, ['Audio', 'Office', 'Sneakers']);
});
```

- [ ] **Step 2: Run the test file to confirm the new tests fail**

Run: `node --test test/adminProductService.test.js`
Expected: FAIL — `adminProductService.getAdminProducts` doesn't exist yet.

- [ ] **Step 3: Add `getAdminProducts` to `src/services/adminProductService.js`**

Add this import at the top of the file (alongside the existing `const { pool } = require('../config/db');`):

```javascript
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');
```

Add this function anywhere in the file (e.g. right after the `pool`/`SLUG_PATTERN` constants, before `createProduct`):

```javascript
// Admin-only, paginated - deliberately separate from productService.js's
// getProducts(), which the storefront needs to return the *entire*
// catalog unpaginated (ProductsContext resolves arbitrary productIds
// against it for the cart/wishlist, ShopPage needs every category
// present for its own filter). Sharing one function between "give me
// everything" and "give me a page" callers would force one of them to
// compromise.
async function getAdminProducts({ q = null, category = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clampedPageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const clampedPage = Math.max(1, page);
  const offset = (clampedPage - 1) * clampedPageSize;
  const searchTerm = q ? `%${q}%` : null;

  // No WHERE clause here, deliberately - the category filter dropdown
  // should always offer every real category, not just the ones that
  // happen to survive whatever filter is currently applied.
  const categoriesResult = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  const categories = categoriesResult.rows.map((row) => row.category);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2 OR category ILIKE $2)`,
    [category, searchTerm]
  );
  const total = Number(countResult.rows[0].total);

  const { rows: products } = await pool.query(
    `SELECT * FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2 OR category ILIKE $2)
     ORDER BY name ASC, slug ASC
     LIMIT $3 OFFSET $4`,
    [category, searchTerm, clampedPageSize, offset]
  );

  return { products, total, page: clampedPage, pageSize: clampedPageSize, categories };
}
```

Add `getAdminProducts` to the file's `module.exports`:

```javascript
module.exports = { createProduct, updateProduct, deleteProduct, getAdminProducts, ValidationError, ConflictError };
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `node --test test/adminProductService.test.js`
Expected: PASS, all tests including the untouched `createProduct`/`updateProduct`/`deleteProduct` ones.

- [ ] **Step 5: Add the route tests to `test/adminProducts.test.js`**

Append these tests to the end of the existing file:

```javascript
test('GET /api/admin/products requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/products returns products, total, page, pageSize, and categories', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/DISTINCT category/.test(sql)) return { rows: [{ category: 'Audio' }] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '1' }] };
    return { rows: [{ slug: 'headphones', name: 'Headphones' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.products.length, 1);
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 20);
    assert.deepEqual(body.categories, ['Audio']);
  });
});

test('GET /api/admin/products?page=2&pageSize=10 forwards page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/DISTINCT category/.test(sql)) return { rows: [] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '15' }] };
    assert.deepEqual(params.slice(2), [10, 10]); // pageSize 10, offset (2-1)*10
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products?page=2&pageSize=10`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.page, 2);
    assert.equal(body.pageSize, 10);
  });
});

test('GET /api/admin/products?page=abc returns 400 for a non-integer page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/products?pageSize=0 returns 400 for a non-positive pageSize', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products?pageSize=0`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 6: Run the test file to confirm the new tests fail**

Run: `node --test test/adminProducts.test.js`
Expected: FAIL — `GET /api/admin/products` doesn't exist yet (404/no route).

- [ ] **Step 7: Add `listProducts` to `src/controllers/adminProductController.js`**

Add this function anywhere in the file (e.g. right after `fieldsFromBody`, before `createProduct`):

```javascript
function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

async function listProducts(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    return res.status(400).json({ error: 'page must be a positive integer.' });
  }

  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    return res.status(400).json({ error: 'pageSize must be a positive integer.' });
  }

  try {
    const result = await adminProductService.getAdminProducts({
      q: req.query.q || null,
      category: req.query.category || null,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    logError('Admin product list error', err);
    res.status(500).json({ error: 'Something went wrong looking up products.' });
  }
}
```

Update the file's `module.exports`:

```javascript
module.exports = { createProduct, updateProduct, deleteProduct, listProducts };
```

- [ ] **Step 8: Wire the route in `src/routes/adminProductRoutes.js`**

Replace the whole file with:

```javascript
const { Router } = require('express');
const { createProduct, updateProduct, deleteProduct, listProducts } = require('../controllers/adminProductController');

const router = Router();

router.get('/', listProducts);
router.post('/', createProduct);
router.patch('/:slug', updateProduct);
router.delete('/:slug', deleteProduct);

module.exports = router;
```

- [ ] **Step 9: Run the test file to confirm it passes**

Run: `node --test test/adminProducts.test.js`
Expected: PASS.

- [ ] **Step 10: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites — in particular confirm `test/products.test.js` (the public `/api/products` suite) is untouched and still green, proving the public endpoint wasn't affected.

- [ ] **Step 11: Commit**

```bash
git add src/services/adminProductService.js src/controllers/adminProductController.js src/routes/adminProductRoutes.js test/adminProductService.test.js test/adminProducts.test.js
git commit -m "Add a paginated GET /api/admin/products endpoint, separate from the public catalog"
```

---

## Task 2: Frontend — `AdminProductsPage` dark reskin on its own CSS namespace

**Files:**
- Modify: `frontend/src/pages/AdminProductsPage.jsx`
- Modify: `frontend/src/index.css` (add a new `.admin-products-*` block; do not touch any existing `.admin-orders-*` rule)
- Test: `frontend/src/pages/AdminProductsPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/products?q=&category=&page=&pageSize=` → `{ products, total, page, pageSize, categories }` (Task 1). `<ProductImage icon={product.icon} size="sm" />` from `../components/ProductImage.jsx` (existing, unchanged).
- Produces: nothing consumed by other tasks — this is a leaf page component.

- [ ] **Step 1: Replace `frontend/src/pages/AdminProductsPage.test.jsx` with the updated test suite**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductsPage } from './AdminProductsPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', sku: 'AUD-HP-001', category: 'Audio', price_cents: 14999, original_price_cents: null, stock_quantity: 42, icon: 'headphones' },
  { slug: 'keyboard', name: 'Mechanical Keyboard', sku: 'PER-KB-002', category: 'Peripherals', price_cents: 8999, original_price_cents: 11999, stock_quantity: 18, icon: 'keyboard' },
];

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ products: PRODUCTS, total: 2, page: 1, pageSize: 10, categories: ['Audio', 'Peripherals'] }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders products fetched from the API', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('AUD-HP-001')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
});

it('links each row to that product\'s edit page', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByRole('link', { name: /wireless noise-cancelling headphones/i })).toHaveAttribute(
    'href',
    '/admin/products/headphones/edit'
  );
});

it('links to the new-product page', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByRole('link', { name: /new product/i })).toHaveAttribute('href', '/admin/products/new');
});

it('shows an original price struck through when a product has one', async () => {
  renderPage();
  await screen.findByText('Mechanical Keyboard');
  expect(screen.getByText('$89.99')).toBeInTheDocument();
  expect(screen.getByText('$119.99')).toBeInTheDocument();
});

it('shows an In Stock badge for products at or above the 10-unit threshold', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  // Both fixture products (42 and 18 units) are >= 10, so both rows read
  // In Stock - the Low Stock threshold itself is exercised by the
  // dedicated fixture in the next test.
  expect(screen.getAllByText('In Stock')).toHaveLength(2);
});

it('shows a Low Stock badge for a product with fewer than 10 units', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          products: [{ slug: 'chair', name: 'Ergonomic Office Chair', sku: 'WRK-CH-003', category: 'Office', price_cents: 24999, original_price_cents: null, stock_quantity: 7, icon: 'chair' }],
          total: 1,
          page: 1,
          pageSize: 10,
          categories: ['Office'],
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('Low Stock')).toBeInTheDocument();
});

it('populates the category filter from the API response and re-fetches page 1 when changed', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  const select = screen.getByLabelText(/filter by category/i);
  expect(within(select).getByRole('option', { name: 'Audio' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Peripherals' })).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'Audio' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('category=Audio') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('re-fetches page 1 with the search query when typed', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  fireEvent.change(screen.getByLabelText(/search products/i), { target: { value: 'PER-KB' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('q=PER-KB') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up products.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('shows numbered page buttons and refetches page 2 on click', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: [], total: 25, page: 1, pageSize: 10, categories: [] }) });
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

it('shows the empty-filters message when no products match', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: [], total: 0, page: 1, pageSize: 10, categories: [] }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No products match these filters.')).toBeInTheDocument();
});

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/products')) {
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

Run: `cd frontend && npx vitest run src/pages/AdminProductsPage.test.jsx`
Expected: FAIL — the component still fetches `/api/products` with no pagination/category filter/stock badges for the tests to find.

- [ ] **Step 3: Replace `frontend/src/pages/AdminProductsPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

function buildQuery({ q, category, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

// Windowed page-number list with ellipsis gaps - identical logic to
// AdminOrdersPage.jsx's own buildPageList (see that file's comment for
// why the two ellipsis entries need distinct string keys).
function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

// No status field exists on products - they just exist or don't (no
// draft/archive state, see the original catalog plan's own scope trim).
// This derives a real, data-backed substitute for the reference design's
// Status column instead of leaving the column empty or fabricating a
// status the schema doesn't have.
function stockBadge(stockQuantity) {
  if (stockQuantity <= 0) return { className: 'out-of-stock', label: 'Out of Stock' };
  if (stockQuantity < 10) return { className: 'low-stock', label: 'Low Stock' };
  return { className: 'in-stock', label: 'In Stock' };
}

export function AdminProductsPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/products?${buildQuery({ q, category, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up products.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setProducts(data.products);
        setTotal(data.total);
        setCategories(data.categories);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, category, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function handleSearchChange(e) {
    setQ(e.target.value);
    setPage(1);
  }

  function handleCategoryChange(e) {
    setCategory(e.target.value);
    setPage(1);
  }

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
  }

  function handleClear() {
    setQ('');
    setCategory('');
    setPage(1);
  }

  return (
    <div className="admin-products-page">
      <div className="admin-products-head">
        <div className="admin-products-head-left">
          <h1>Products</h1>
          <span className="admin-products-count">
            {total} product{total === 1 ? '' : 's'}
          </span>
        </div>
        <Link to="/admin/products/new" className="admin-products-new-link">
          New Product
        </Link>
      </div>

      <div className="admin-products-toolbar">
        <div className="admin-products-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-products-search" className="sr-only">
            Search products by name, SKU, or category
          </label>
          <input
            id="admin-products-search"
            type="text"
            placeholder="Search by name, SKU, or category..."
            value={q}
            onChange={handleSearchChange}
          />
        </div>

        <label htmlFor="admin-products-category" className="sr-only">
          Filter by category
        </label>
        <select id="admin-products-category" value={category} onChange={handleCategoryChange}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="admin-products-clear"
          onClick={handleClear}
          disabled={!q && !category}
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
        <div className="admin-products-table-card">
          <table className="admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="admin-products-num">Price</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const badge = stockBadge(product.stock_quantity);
                return (
                  <tr key={product.slug}>
                    <td>
                      <div className="admin-products-product-cell">
                        <ProductImage icon={product.icon} size="sm" />
                        <div>
                          <Link className="admin-products-name" to={`/admin/products/${product.slug}/edit`}>
                            {product.name}
                          </Link>
                          <span className="admin-products-sku">{product.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td>{product.category}</td>
                    <td className="admin-products-num admin-products-price">
                      <span className="admin-products-price-current">{formatCents(product.price_cents)}</span>
                      {product.original_price_cents != null && (
                        <span className="admin-products-price-original">{formatCents(product.original_price_cents)}</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-products-stock-cell">
                        <span className="admin-products-stock-count">{product.stock_quantity}</span>
                        <span className={`admin-products-stock-badge ${badge.className}`}>{badge.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr className="admin-products-empty-row">
                  <td colSpan={4}>No products match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-products-pager">
          <div className="admin-products-pager-left">
            <label htmlFor="admin-products-page-size">Rows per page</label>
            <select id="admin-products-page-size" value={pageSize} onChange={handlePageSizeChange}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>

          <div className="admin-products-pager-right">
            <button
              type="button"
              className="admin-products-page-btn"
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
                  className={`admin-products-page-btn${p === page ? ' current' : ''}`}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ) : (
                <span key={p} className="admin-products-page-ellipsis">
                  &hellip;
                </span>
              )
            )}
            <button
              type="button"
              className="admin-products-page-btn"
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

- [ ] **Step 4: Run the test file — expected to still fail on rendering (no CSS yet), but confirm the logic is correct first**

Run: `cd frontend && npx vitest run src/pages/AdminProductsPage.test.jsx`
Expected: PASS. Testing Library assertions don't depend on CSS, so the component's logic being correct is sufaicient for these tests to go green even before Step 5's styling — run this now to confirm the JSX/fetch logic is right before touching CSS.

- [ ] **Step 5: Add the new `.admin-products-*` CSS block to `frontend/src/index.css`**

Find the existing `.admin-products-new-link` rule and its `:hover` rule (search for `.admin-products-new-link {` — do not rely on a specific line number, this file has shifted since earlier edits). Replace those two rules with the following full block, which restyles `.admin-products-new-link` as part of the same block as everything else new:

```css
.admin-products-page {
  padding: 2rem 1.75rem 3rem;
  background: #0a0a0a;
  min-height: 100vh;
  color: #fafafa;
}

.admin-products-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.admin-products-head-left {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
}

.admin-products-head h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.admin-products-count {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #a1a1a1;
  background: #171717;
  border: 1px solid #434343;
  border-radius: var(--radius-pill);
  padding: 0.2rem 0.65rem;
}

.admin-products-new-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #fafafa;
  color: #101010;
  border: none;
  border-radius: 6px;
  padding: 0.55rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.admin-products-new-link:hover {
  opacity: 0.9;
}

.admin-products-toolbar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.admin-products-toolbar select {
  padding: 0.45rem 0.85rem;
  border: 1px solid #434343;
  border-radius: var(--radius-pill);
  background: #171717;
  color: #fafafa;
  font-size: 0.85rem;
}

.admin-products-search {
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

.admin-products-search svg {
  flex-shrink: 0;
  color: #6b6b6b;
}

.admin-products-search input {
  border: none;
  outline: none;
  background: transparent;
  color: #fafafa;
  width: 100%;
  font-size: 0.85rem;
}

.admin-products-search input::placeholder {
  color: #6b6b6b;
}

.admin-products-clear {
  background: none;
  border: 1px solid transparent;
  color: #a1a1a1;
  font-size: 0.85rem;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
}

.admin-products-clear:hover:not(:disabled) {
  color: #fafafa;
}

.admin-products-clear:disabled {
  opacity: 0.4;
  cursor: default;
}

.admin-products-table-card {
  border: 1px solid #434343;
  border-radius: 10px;
  background: #171717;
  overflow: hidden;
  overflow-x: auto;
}

.admin-products-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

.admin-products-table th,
.admin-products-table td {
  text-align: left;
  padding: 0.7rem 1.1rem;
  border-bottom: 1px solid #434343;
  font-size: 0.86rem;
}

.admin-products-table th {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #a1a1a1;
  background: #141414;
}

.admin-products-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-products-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.025);
}

.admin-products-num {
  text-align: right;
}

.admin-products-product-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* .product-image's own background/text-color tokens are theme-adaptive
   (var(--color-solid-bg)/var(--color-primary-text)) - this page is always
   dark regardless of the site's own theme state, so it needs the same
   pinning treatment the Orders page already applies to .order-history-badge. */
.admin-products-page .product-image {
  background: #141414;
  color: #a1a1a1;
}

.admin-products-name {
  font-weight: 600;
  color: #fafafa;
  text-decoration: none;
  display: block;
}

.admin-products-name:hover {
  text-decoration: underline;
}

.admin-products-sku {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: #a1a1a1;
  margin-top: 0.1rem;
}

.admin-products-price {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.admin-products-price-current {
  font-weight: 600;
  color: #fafafa;
}

.admin-products-price-original {
  color: #6b6b6b;
  text-decoration: line-through;
  margin-left: 0.4rem;
  font-size: 0.8rem;
}

.admin-products-stock-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.admin-products-stock-count {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: #fafafa;
}

.admin-products-stock-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.28rem 0.6rem;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.admin-products-stock-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.admin-products-stock-badge.in-stock { background: rgba(6, 78, 59, 0.6); color: #34d399; }
.admin-products-stock-badge.low-stock { background: rgba(69, 26, 3, 0.6); color: #fbbf24; }
.admin-products-stock-badge.out-of-stock { background: rgba(76, 5, 25, 0.6); color: #fb7185; }

.admin-products-empty-row td {
  padding: 3rem 1.1rem;
  text-align: center;
  color: #a1a1a1;
}

.admin-products-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1rem;
  font-size: 0.82rem;
  color: #a1a1a1;
}

.admin-products-pager-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.admin-products-pager-left select {
  background: #171717;
  border: 1px solid #434343;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  color: #fafafa;
}

.admin-products-pager-right {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-mono);
}

.admin-products-page-btn {
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

.admin-products-page-btn:hover:not(:disabled) {
  border-color: #a1a1a1;
  color: #fafafa;
}

.admin-products-page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.admin-products-page-btn.current {
  background: #fafafa;
  color: #101010;
  border-color: #fafafa;
  font-weight: 600;
}

.admin-products-page-ellipsis {
  padding: 0 0.15rem;
  color: #6b6b6b;
}

/* Every focusable element on this page must resolve to the fixed #fafafa
   accent regardless of the site's own theme state. Two rules, not one -
   the Orders page needed both: a universal rule for elements with no
   higher-specificity competing site-wide rule (links, buttons, selects),
   and a second `input`-specific rule to beat the site-wide
   input[type="text"]:focus-visible rule's higher specificity for the
   search input specifically. See index.css's own admin-orders-page
   comment beside its equivalent pair of rules for the full specificity
   math - the same fight applies here for the same reason. */
.admin-products-page *:focus-visible {
  outline: 2px solid #fafafa;
  outline-offset: 2px;
}

.admin-products-page input:focus-visible {
  outline: 2px solid #fafafa;
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files — in particular confirm `AdminOrdersPage.test.jsx` and `AdminNav.test.jsx` are still green, proving the new CSS block didn't collide with the existing `.admin-orders-*`/`.admin-nav-*` rules.

- [ ] **Step 7: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/AdminProductsPage.jsx frontend/src/pages/AdminProductsPage.test.jsx frontend/src/index.css
git commit -m "Dark-reskin the admin Products page on its own CSS namespace, with category filter and stock badges"
```

---

## Post-plan manual verification (not a task — do this after both tasks land)

Start the dev server and log in as admin, then confirm in the browser:
1. `/admin/products` renders the full dark theme (page, toolbar, table, pager) with no light-theme flashes, and its thumbnails/badges/prices look right for all 6 real seeded products.
2. `/admin/orders` and `/admin/customers` still look exactly as they did before this plan — confirms the new `.admin-products-*` classes didn't leak anywhere.
3. Category filter dropdown lists all 6 real categories (Audio, Peripherals, Office, Displays, Accessories, Sneakers) and re-fetches correctly when changed; search re-fetches correctly; both reset to page 1.
4. Chair (7 in stock) shows a Low Stock badge; every other seeded product shows In Stock.
5. Keyboard and Cloud Shift Runner show a struck-through original price next to the current price; the other four don't.
6. "New Product" still navigates to `/admin/products/new` and looks like a real primary button in the dark header, not a plain link.
7. Tab through the toolbar and pager with the keyboard — every focus ring should be clearly visible `#fafafa`, never invisible against the dark surfaces.
