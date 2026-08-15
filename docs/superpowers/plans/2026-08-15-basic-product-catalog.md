# Basic Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this app's entirely-static, backend-less product catalog with a real `products` table, admin CRUD to manage it, and a storefront (`ShopPage`, `ProductDetailPage`, `BagPage`, `WishlistPage`) that reads from it instead of hardcoded JS data.

**Architecture:** A public read side (`productService.js`, no auth) and an admin-gated write side (`adminProductService.js`, `requireAdminAuth`), mirroring the existing customer/admin split already used for orders and customers. A new `ProductsContext` (mirrors `OrdersContext`'s "fetch once, mounted in Layout" pattern) replaces every direct `SHOP_PRODUCTS` import on the frontend. Two new admin pages join the existing Orders/Customers admin surface behind a third `AdminNav` tab.

**Tech Stack:** Node/Express, `pg`, `node-pg-migrate`, `node:test`. React/Vite frontend, Vitest + Testing Library, `react-router-dom`.

## Global Constraints

- `slug TEXT PRIMARY KEY` is the product's identifier end-to-end (not a numeric id) — matches the existing `customer_profiles` table's non-numeric-PK precedent, and matches how the frontend already uses string ids in `/shop/:productId`.
- The backend returns raw DB field names (snake_case: `price_cents`, `original_price_cents`, `stock_quantity`, `cover_image_url`) — this app never aliases DB columns to camelCase anywhere (`order.customer_email`, `order.created_at`, etc. are read verbatim throughout). Frontend code reading these fields uses destructuring aliases (`const { price_cents: priceCents } = product`) to keep local variable names readable without introducing a translation layer.
- `colorways` is a `JSONB` column — the `pg` driver returns JSONB already parsed as a JS array/object, so no serialization/deserialization code is needed on read; only `JSON.stringify(...)` on write (`INSERT`/`UPDATE` parameters).
- No pagination on `GET /api/products` — the current UI already loads the full catalog into memory for client-side filtering/sorting, and a handful of products doesn't need pagination machinery nothing else uses yet.
- No draft/unpublished product state — every row in `products` is immediately live in the storefront.
- `cover_image_url` is an admin-entered URL field, not a file upload.
- Colorways are not editable through the admin form in this pass — new products get `colorways: []` by default; editing colorways is deferred to the later "Product Variants" sub-project where they become real, stock-bearing variants instead of decorative display data.
- `cover_image_url` is persisted and admin-editable but not yet wired into storefront image rendering — `ProductImage.jsx` keeps using its existing icon-keyed `PRODUCT_PHOTOS` map. This is a deliberate scope trim, not a regression: no existing behavior changes, a genuinely new capability just isn't surfaced visually yet.
- Follow this codebase's established test split: service-level tests mock `pool.query` directly; route-level tests use the `withServer`/`issueAdminToken` pattern (`test/adminOrders.test.js`); frontend tests render through the relevant provider(s) with a mocked `global.fetch`.

---

### Task 1: Migration — `products` table + seed backfill

**Files:**
- Create: `migrations/<ts>_add-products-table.sql`
- Create: `migrations/<ts>_backfill-products.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a `products` table with columns `slug` (PK), `name`, `description`, `category`, `price_cents`, `original_price_cents`, `cover_image_url`, `icon`, `sku` (unique), `stock_quantity`, `colorways` (JSONB), `created_at`, `updated_at` — seeded with the 6 products currently in `frontend/src/data/shopProducts.js`, consumed via `SELECT *` by every later task.

- [ ] **Step 1: Create and write the schema migration**

Run: `npm run migrate:create add-products-table`

Replace its contents with:

```sql
-- Up Migration

-- This app had no product/inventory backend at all before this - products
-- were static frontend JS data (frontend/src/data/shopProducts.js), and
-- its own comment says so outright. slug (not a numeric id) is the
-- primary key, matching customer_profiles' existing precedent of a
-- non-numeric PK and matching how the frontend already uses string ids
-- in /shop/:productId.
CREATE TABLE products (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  original_price_cents INTEGER,
  cover_image_url TEXT,
  icon TEXT,
  sku TEXT NOT NULL UNIQUE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  colorways JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS products;
```

- [ ] **Step 2: Create and write the backfill migration**

Run: `npm run migrate:create backfill-products`

Replace its contents with (the exact 6 products from `shopProducts.js`, verbatim for name/description/category/price/colorways; `sku`/`stock_quantity` are new fabricated-but-plausible values this app didn't have before; `cover_image_url` reuses the real local photos already mapped in `frontend/src/components/ProductImage.jsx`'s `PRODUCT_PHOTOS`, `NULL` where none exists):

```sql
-- Up Migration

INSERT INTO products (slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways) VALUES
('headphones', 'Wireless Noise-Cancelling Headphones', 'Over-ear comfort with active noise cancellation.', 'Audio', 14999, NULL, '/images/products/luke-peterson-lUMj2Zv5HUE-unsplash.jpg', 'headphones', 'AUD-HP-001', 42,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"navy","label":"Navy","hex":"#1e3a5f"}]'::jsonb),
('keyboard', 'Mechanical Keyboard', 'Tactile switches with per-key backlighting.', 'Peripherals', 8999, 11999, '/images/products/pparnxoxo-vdAR-KDxHNY-unsplash.jpg', 'keyboard', 'PER-KB-002', 18,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"gray","label":"Gray","hex":"#8a8a8a"}]'::jsonb),
('chair', 'Ergonomic Office Chair', 'Adjustable lumbar support for all-day sitting.', 'Office', 24999, NULL, '/images/products/effydesk-7mfNpV5eJH0-unsplash.jpg', 'chair', 'WRK-CH-003', 7,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"gray","label":"Gray","hex":"#8a8a8a"},{"id":"blue","label":"Blue","hex":"#3b5f8f"}]'::jsonb),
('monitor', '27" 4K Monitor', 'Sharp UHD resolution for work and creative tasks.', 'Displays', 32999, NULL, '/images/products/sebastian-bednarek-x2Z0uNj-Quo-unsplash.jpg', 'monitor', 'DIS-MN-004', 23,
  '[]'::jsonb),
('cable', 'USB-C Charging Cable (3-pack)', 'Fast-charging cables in three lengths.', 'Accessories', 1999, NULL, '/images/products/homemade-media-6l5z2EPrnFc-unsplash.jpg', 'cable', 'ACC-CB-005', 156,
  '[{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"black","label":"Black","hex":"#1a1a1a"}]'::jsonb),
('cloud-shift-runner', 'Cloud Shift Runner', 'Daily road runner with breathable mesh, a single-density foam midsole, and a rubber outsole built for steady miles.', 'Sneakers', 9600, 12800, NULL, 'sneaker', 'SNK-CS-006', 31,
  '[{"id":"cherry","label":"Cherry","hex":"#c81e3a"},{"id":"navy","label":"Navy","hex":"#1e3a5f"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"yellow","label":"Yellow","hex":"#f2c14e"},{"id":"green","label":"Green","hex":"#b9e63a"}]'::jsonb);

-- Down Migration

DELETE FROM products WHERE slug IN ('headphones', 'keyboard', 'chair', 'monitor', 'cable', 'cloud-shift-runner');
```

- [ ] **Step 3: Apply both migrations**

Run: `npm run migrate:up`
Expected: both migrations report success in the command's own output.

- [ ] **Step 4: Verify via the existing test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add migrations/<schema-migration-file> migrations/<backfill-migration-file>
git commit -m "Add products table, backfill with the existing static catalog"
```

---

### Task 2: Backend services — `productService.js` + `adminProductService.js`

**Files:**
- Create: `src/services/productService.js`
- Create: `src/services/adminProductService.js`
- Test: `test/productService.test.js`
- Test: `test/adminProductService.test.js`

**Interfaces:**
- Consumes: `pool` from `src/config/db.js`.
- Produces: `productService.getProducts()` → `Promise<object[]>` (all products); `productService.getProductBySlug(slug)` → `Promise<object|null>`. `adminProductService.createProduct(fields)` → `Promise<object>` (the created row), throws `ValidationError` or `ConflictError`; `adminProductService.updateProduct(slug, fields)` → `Promise<object|null>` (`null` if `slug` doesn't exist), throws the same two error types; `adminProductService.deleteProduct(slug)` → `Promise<boolean>` (whether a row was actually deleted). `adminProductService.ValidationError`/`ConflictError` (the latter carries a `.field` property, `'slug'` or `'sku'`) — consumed directly by Task 3's controller to map to `400`/`409`.

- [ ] **Step 1: Write the failing tests for `productService`**

```js
// test/productService.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const productService = require('../src/services/productService');

test('getProducts returns every row', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /SELECT \* FROM products/);
    return { rows: [{ slug: 'headphones' }, { slug: 'keyboard' }] };
  });

  const products = await productService.getProducts();
  assert.equal(products.length, 2);
});

test('getProductBySlug returns the matching row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE slug = \$1/);
    assert.deepEqual(params, ['headphones']);
    return { rows: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] };
  });

  const product = await productService.getProductBySlug('headphones');
  assert.equal(product.name, 'Wireless Noise-Cancelling Headphones');
});

test('getProductBySlug returns null when nothing matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const product = await productService.getProductBySlug('nope');
  assert.equal(product, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/productService.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement `src/services/productService.js`**

```js
// src/services/productService.js
const { pool } = require('../config/db');

async function getProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at ASC');
  return rows;
}

async function getProductBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

module.exports = { getProducts, getProductBySlug };
```

- [ ] **Step 4: Run to verify the `productService` tests pass**

Run: `node --test test/productService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for `adminProductService`**

```js
// test/adminProductService.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminProductService = require('../src/services/adminProductService');

const VALID_FIELDS = {
  slug: 'new-product',
  name: 'New Product',
  category: 'Accessories',
  price_cents: 1999,
  sku: 'ACC-NP-999',
};

test('createProduct rejects a missing required field', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, name: undefined }),
    adminProductService.ValidationError
  );
});

test('createProduct rejects a non-integer price_cents', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, price_cents: 19.99 }),
    adminProductService.ValidationError
  );
});

test('createProduct rejects a negative stock_quantity', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, stock_quantity: -1 }),
    adminProductService.ValidationError
  );
});

test('createProduct inserts and returns the new row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /INSERT INTO products/);
    assert.equal(params[0], 'new-product');
    return { rows: [{ ...VALID_FIELDS, stock_quantity: 0, colorways: [] }] };
  });

  const product = await adminProductService.createProduct(VALID_FIELDS);
  assert.equal(product.slug, 'new-product');
});

test('createProduct surfaces a slug/sku collision as ConflictError', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_pkey"');
    err.code = '23505';
    err.constraint = 'products_pkey';
    throw err;
  });

  await assert.rejects(adminProductService.createProduct(VALID_FIELDS), adminProductService.ConflictError);
});

test('createProduct surfaces a sku collision distinctly from a slug collision', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_sku_key"');
    err.code = '23505';
    err.constraint = 'products_sku_key';
    throw err;
  });

  await assert.rejects(adminProductService.createProduct(VALID_FIELDS), (err) => {
    assert.ok(err instanceof adminProductService.ConflictError);
    assert.equal(err.field, 'sku');
    return true;
  });
});

test('updateProduct returns null when the slug does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const product = await adminProductService.updateProduct('nope', { name: 'New Name' });
  assert.equal(product, null);
});

test('updateProduct merges the given fields onto the existing row', async (t) => {
  let call = 0;
  t.mock.method(pool, 'query', async (sql, params) => {
    call += 1;
    if (call === 1) {
      return { rows: [{ slug: 'headphones', name: 'Old Name', description: 'Old desc', category: 'Audio', price_cents: 100, original_price_cents: null, cover_image_url: null, icon: 'headphones', sku: 'AUD-HP-001', stock_quantity: 5, colorways: [] }] };
    }
    assert.match(sql, /UPDATE products SET/);
    assert.equal(params[0], 'New Name'); // name
    assert.equal(params[3], 100); // price_cents unchanged from current row
    return { rows: [{ slug: 'headphones', name: 'New Name', price_cents: 100 }] };
  });

  const product = await adminProductService.updateProduct('headphones', { name: 'New Name' });
  assert.equal(product.name, 'New Name');
});

test('deleteProduct returns true when a row was deleted', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /DELETE FROM products WHERE slug = \$1/);
    assert.deepEqual(params, ['headphones']);
    return { rows: [{ slug: 'headphones' }] };
  });

  const deleted = await adminProductService.deleteProduct('headphones');
  assert.equal(deleted, true);
});

test('deleteProduct returns false when the slug does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const deleted = await adminProductService.deleteProduct('nope');
  assert.equal(deleted, false);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test test/adminProductService.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 7: Implement `src/services/adminProductService.js`**

```js
// src/services/adminProductService.js
const { pool } = require('../config/db');

const REQUIRED_FIELDS = ['slug', 'name', 'category', 'price_cents', 'sku'];

class ValidationError extends Error {}
class ConflictError extends Error {
  constructor(field) {
    super(`${field} already exists`);
    this.field = field;
  }
}

function validateCreateFields(fields) {
  for (const key of REQUIRED_FIELDS) {
    if (fields[key] === undefined || fields[key] === null || fields[key] === '') {
      throw new ValidationError(`${key} is required.`);
    }
  }
  validateNumericFields(fields);
}

function validateNumericFields(fields) {
  if (fields.price_cents !== undefined && (!Number.isInteger(fields.price_cents) || fields.price_cents < 0)) {
    throw new ValidationError('price_cents must be a non-negative integer.');
  }
  if (
    fields.stock_quantity !== undefined &&
    (!Number.isInteger(fields.stock_quantity) || fields.stock_quantity < 0)
  ) {
    throw new ValidationError('stock_quantity must be a non-negative integer.');
  }
}

// A UNIQUE-violation's constraint name tells us which column collided -
// "products_pkey" is the slug's primary key, anything else with "sku" in
// its name is the sku's own UNIQUE constraint - so a create/update against
// either can surface a specific, distinguishable error rather than a
// generic "something already exists".
function mapUniqueViolation(err) {
  if (err.code === '23505') {
    if (err.constraint && err.constraint.includes('sku')) return new ConflictError('sku');
    return new ConflictError('slug');
  }
  return err;
}

async function createProduct(fields) {
  validateCreateFields(fields);
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        fields.slug,
        fields.name,
        fields.description ?? null,
        fields.category,
        fields.price_cents,
        fields.original_price_cents ?? null,
        fields.cover_image_url ?? null,
        fields.icon ?? null,
        fields.sku,
        fields.stock_quantity ?? 0,
        JSON.stringify(fields.colorways ?? []),
      ]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

// Fetches the current row first and merges - PATCH accepts any subset of
// fields, and a plain SQL UPDATE with unconditional SET clauses would
// overwrite every unlisted field with NULL/undefined. slug itself is never
// updatable (it's the URL/primary-key identifier); a PATCH changes a
// product's other attributes, not its identity.
async function updateProduct(slug, fields) {
  validateNumericFields(fields);

  const existing = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  if (existing.rows.length === 0) return null;
  const current = existing.rows[0];

  const merged = {
    name: fields.name ?? current.name,
    description: fields.description !== undefined ? fields.description : current.description,
    category: fields.category ?? current.category,
    price_cents: fields.price_cents ?? current.price_cents,
    original_price_cents:
      fields.original_price_cents !== undefined ? fields.original_price_cents : current.original_price_cents,
    cover_image_url: fields.cover_image_url !== undefined ? fields.cover_image_url : current.cover_image_url,
    icon: fields.icon !== undefined ? fields.icon : current.icon,
    sku: fields.sku ?? current.sku,
    stock_quantity: fields.stock_quantity ?? current.stock_quantity,
    colorways: fields.colorways !== undefined ? fields.colorways : current.colorways,
  };

  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = $1, description = $2, category = $3, price_cents = $4, original_price_cents = $5,
         cover_image_url = $6, icon = $7, sku = $8, stock_quantity = $9, colorways = $10, updated_at = now()
       WHERE slug = $11
       RETURNING *`,
      [
        merged.name,
        merged.description,
        merged.category,
        merged.price_cents,
        merged.original_price_cents,
        merged.cover_image_url,
        merged.icon,
        merged.sku,
        merged.stock_quantity,
        JSON.stringify(merged.colorways),
        slug,
      ]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

async function deleteProduct(slug) {
  const { rows } = await pool.query('DELETE FROM products WHERE slug = $1 RETURNING slug', [slug]);
  return rows.length > 0;
}

module.exports = { createProduct, updateProduct, deleteProduct, ValidationError, ConflictError };
```

- [ ] **Step 8: Run to verify the `adminProductService` tests pass**

Run: `node --test test/adminProductService.test.js`
Expected: PASS (10 tests)

- [ ] **Step 9: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 10: Commit**

```bash
git add src/services/productService.js src/services/adminProductService.js test/productService.test.js test/adminProductService.test.js
git commit -m "Add productService and adminProductService"
```

---

### Task 3: HTTP layer — public + admin product routes

**Files:**
- Create: `src/controllers/productController.js`
- Create: `src/controllers/adminProductController.js`
- Create: `src/routes/productRoutes.js`
- Create: `src/routes/adminProductRoutes.js`
- Modify: `src/app.js` (mount both routers)
- Test: `test/products.test.js`
- Test: `test/adminProducts.test.js`

**Interfaces:**
- Consumes: `productService.getProducts`, `productService.getProductBySlug` (Task 2); `adminProductService.createProduct`, `updateProduct`, `deleteProduct`, `ValidationError`, `ConflictError` (Task 2); `requireAdminAuth` (existing, already imported in `src/app.js`); `auditLog` (existing, `src/config/auditLog.js`); `logError` (existing, `src/utils/logger.js`).
- Produces: `GET /api/products` (public, `{ products }`), `GET /api/products/:slug` (public, the raw product object, `404` if unknown) — mounted at `/api/products`, no auth. `POST /api/admin/products`, `PATCH /api/admin/products/:slug`, `DELETE /api/admin/products/:slug` — mounted at `/api/admin/products`, gated by `requireAdminAuth` at the router-mount level (same pattern as `/api/admin/orders` and `/api/admin/customers`).

- [ ] **Step 1: Write the failing tests for the public routes**

```js
// test/products.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('GET /api/products requires no auth and returns every product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'headphones' }, { slug: 'keyboard' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.products.length, 2);
  });
});

test('GET /api/products/:slug returns the matching product with no auth', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products/headphones`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.slug, 'headphones');
  });
});

test('GET /api/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products/nope`);
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/products.test.js`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Implement `src/controllers/productController.js`**

```js
// src/controllers/productController.js
const productService = require('../services/productService');
const { logError } = require('../utils/logger');

async function listProducts(req, res) {
  try {
    const products = await productService.getProducts();
    res.json({ products });
  } catch (err) {
    logError('Product list error', err);
    res.status(500).json({ error: 'Something went wrong looking up products.' });
  }
}

async function getProduct(req, res) {
  try {
    const product = await productService.getProductBySlug(req.params.slug);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    logError('Product lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that product.' });
  }
}

module.exports = { listProducts, getProduct };
```

- [ ] **Step 4: Implement `src/routes/productRoutes.js`**

```js
// src/routes/productRoutes.js
const { Router } = require('express');
const { listProducts, getProduct } = require('../controllers/productController');

const router = Router();

router.get('/', listProducts);
router.get('/:slug', getProduct);

module.exports = router;
```

- [ ] **Step 5: Mount the public router in `src/app.js`**

Add the require near the other route requires, alongside `adminCustomerRoutes`:

```js
const productRoutes = require('./routes/productRoutes');
```

Add the mount near the other route mounts — no `requireAdminAuth`, this is public:

```js
app.use('/api/products', productRoutes);
```

- [ ] **Step 6: Run to verify the public-route tests pass**

Run: `node --test test/products.test.js`
Expected: PASS (3 tests)

- [ ] **Step 7: Write the failing tests for the admin routes**

```js
// test/adminProducts.test.js
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

const VALID_BODY = { slug: 'new-product', name: 'New Product', category: 'Accessories', price_cents: 1999, sku: 'ACC-NP-999' };

test('POST /api/admin/products requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/products creates a product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...VALID_BODY, stock_quantity: 0, colorways: [] }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.slug, 'new-product');
  });
});

test('POST /api/admin/products rejects a missing required field with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ ...VALID_BODY, name: undefined }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/admin/products returns 409 for a duplicate slug', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_pkey"');
    err.code = '23505';
    err.constraint = 'products_pkey';
    throw err;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 409);
  });
});

test('PATCH /api/admin/products/:slug updates a product', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE products/.test(sql)) return { rows: [{ ...VALID_BODY, name: 'Updated Name' }] };
    return { rows: [{ ...VALID_BODY }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/new-product`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Updated Name');
  });
});

test('PATCH /api/admin/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/nope`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ name: 'New Name' }),
    });
    assert.equal(res.status, 404);
  });
});

test('DELETE /api/admin/products/:slug deletes a product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'new-product' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/new-product`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
  });
});

test('DELETE /api/admin/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/nope`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `node --test test/adminProducts.test.js`
Expected: FAIL — the routes don't exist yet.

- [ ] **Step 9: Implement `src/controllers/adminProductController.js`**

```js
// src/controllers/adminProductController.js
const adminProductService = require('../services/adminProductService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const WRITABLE_FIELDS = [
  'slug',
  'name',
  'description',
  'category',
  'price_cents',
  'original_price_cents',
  'cover_image_url',
  'icon',
  'sku',
  'stock_quantity',
  'colorways',
];

function fieldsFromBody(body) {
  const fields = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
}

async function createProduct(req, res) {
  try {
    const product = await adminProductService.createProduct(fieldsFromBody(req.body));
    auditLog('admin.product.created', { slug: product.slug, admin: req.adminEmail });
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof adminProductService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminProductService.ConflictError) {
      return res.status(409).json({ error: `${err.field} already exists.` });
    }
    logError('Admin product create error', err);
    res.status(500).json({ error: 'Something went wrong creating that product.' });
  }
}

async function updateProduct(req, res) {
  try {
    const product = await adminProductService.updateProduct(req.params.slug, fieldsFromBody(req.body));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    auditLog('admin.product.updated', { slug: req.params.slug, admin: req.adminEmail });
    res.json(product);
  } catch (err) {
    if (err instanceof adminProductService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminProductService.ConflictError) {
      return res.status(409).json({ error: `${err.field} already exists.` });
    }
    logError('Admin product update error', err);
    res.status(500).json({ error: 'Something went wrong updating that product.' });
  }
}

async function deleteProduct(req, res) {
  try {
    const deleted = await adminProductService.deleteProduct(req.params.slug);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }
    auditLog('admin.product.deleted', { slug: req.params.slug, admin: req.adminEmail });
    res.json({ ok: true });
  } catch (err) {
    logError('Admin product delete error', err);
    res.status(500).json({ error: 'Something went wrong deleting that product.' });
  }
}

module.exports = { createProduct, updateProduct, deleteProduct };
```

- [ ] **Step 10: Implement `src/routes/adminProductRoutes.js`**

```js
// src/routes/adminProductRoutes.js
const { Router } = require('express');
const { createProduct, updateProduct, deleteProduct } = require('../controllers/adminProductController');

const router = Router();

router.post('/', createProduct);
router.patch('/:slug', updateProduct);
router.delete('/:slug', deleteProduct);

module.exports = router;
```

- [ ] **Step 11: Mount the admin router in `src/app.js`**

Add the require alongside `productRoutes`:

```js
const adminProductRoutes = require('./routes/adminProductRoutes');
```

Add the mount near the other `/api/admin/*` mounts, gated the same way as `/api/admin/customers`:

```js
app.use('/api/admin/products', requireAdminAuth, adminProductRoutes);
```

- [ ] **Step 12: Run to verify the admin-route tests pass**

Run: `node --test test/adminProducts.test.js`
Expected: PASS (8 tests)

- [ ] **Step 13: Run the full backend suite**

Run: `npm test`
Expected: PASS, no regressions

- [ ] **Step 14: Commit**

```bash
git add src/controllers/productController.js src/controllers/adminProductController.js src/routes/productRoutes.js src/routes/adminProductRoutes.js src/app.js test/products.test.js test/adminProducts.test.js
git commit -m "Add public and admin product HTTP routes"
```

---

### Task 4: `ProductsContext.jsx` — wire into `Layout.jsx`

**Files:**
- Create: `frontend/src/context/ProductsContext.jsx`
- Test: `frontend/src/context/ProductsContext.test.jsx`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: `GET /api/products` (Task 3), returns `{ products }`.
- Produces: `ProductsProvider` (React component), `useProducts()` → `{ products: object[]|null, error: string|null, findProduct(slug): object|undefined }`. Consumed directly by Tasks 5 and 6, and by `Layout.jsx` itself in this task.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/context/ProductsContext.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductsProvider, useProducts } from './ProductsContext.jsx';

function Probe() {
  const { products, error, findProduct } = useProducts();
  if (error) return <p role="alert">{error}</p>;
  if (!products) return <p>Loading...</p>;
  return (
    <ul>
      {products.map((p) => (
        <li key={p.slug}>{p.name}</li>
      ))}
      <li data-testid="found">{findProduct('headphones')?.name ?? 'not found'}</li>
    </ul>
  );
}

function renderProbe() {
  return render(
    <ProductsProvider>
      <Probe />
    </ProductsProvider>
  );
}

it('fetches products once and exposes them via useProducts', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ products: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }) })
  );

  renderProbe();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/products');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('findProduct returns the matching product by slug', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ products: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }) })
  );

  renderProbe();
  await waitFor(() => expect(screen.getByTestId('found')).toHaveTextContent('Wireless Noise-Cancelling Headphones'));
});

it('surfaces a fetch failure as an error', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading products.' }) }));

  renderProbe();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- ProductsContext`
Expected: FAIL — `Failed to resolve import "./ProductsContext.jsx"`

- [ ] **Step 3: Implement `ProductsContext.jsx`**

```jsx
// frontend/src/context/ProductsContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';

const ProductsContext = createContext(null);

// Single shared fetch for the real product catalog - mirrors OrdersContext's
// "fetch once, mounted once in Layout" pattern exactly: ShopPage,
// ProductDetailPage, BagPage, WishlistPage, and Layout's own page-header
// title lookup all need the same catalog, and each fetching independently
// would be redundant round-trips for data that doesn't change per-page.
export function ProductsProvider({ children }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading products.');
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setProducts(data.products);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function findProduct(slug) {
    return products ? products.find((p) => p.slug === slug) : undefined;
  }

  return <ProductsContext.Provider value={{ products, error, findProduct }}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within a ProductsProvider');
  return ctx;
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- ProductsContext`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire `ProductsProvider` into `Layout.jsx`**

`Layout.jsx` currently imports `SHOP_PRODUCTS` directly (`frontend/src/components/Layout.jsx:5`) to look up a product's name for the page-header title on `/shop/:productId`. Replace that static lookup with the new context.

Replace the import at line 5:

```js
import { SHOP_PRODUCTS } from '../data/shopProducts.js';
```

with:

```js
import { ProductsProvider, useProducts } from '../context/ProductsContext.jsx';
```

Replace `getPageHeader` (lines 41-49) — it now takes the already-looked-up `product` as a parameter instead of importing `SHOP_PRODUCTS` itself:

```js
function getPageHeader(pathname, params, product) {
  if (params.orderNumber) return { icon: OrdersIcon, title: params.orderNumber, docTitle: params.orderNumber };
  if (params.productId) {
    const title = product?.name ?? 'Product';
    return { icon: ShopIcon, title, docTitle: title };
  }
  return PAGE_HEADERS[pathname] || { icon: null, title: '', docTitle: '' };
}
```

Replace `Layout()` (lines 92-100) to also mount `ProductsProvider`:

```jsx
export function Layout() {
  return (
    <OrdersProvider>
      <CartProvider>
        <ProductsProvider>
          <LayoutInner />
        </ProductsProvider>
      </CartProvider>
    </OrdersProvider>
  );
}
```

In `LayoutInner` (starts at line 102), add `useProducts()` alongside the existing `useOrders()`/`useCart()` calls (near line 103-104):

```js
  const { orders } = useOrders();
  const { items: cartItems } = useCart();
  const { findProduct } = useProducts();
```

And update the `getPageHeader` call (line 120) to pass the looked-up product:

```js
  const { icon: PageIcon, title: pageTitle, docTitle } = getPageHeader(location.pathname, params, findProduct(params.productId));
```

- [ ] **Step 6: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add frontend/src/context/ProductsContext.jsx frontend/src/context/ProductsContext.test.jsx frontend/src/components/Layout.jsx
git commit -m "Add ProductsContext, wire into Layout for real product data"
```

---

### Task 5: Convert `ShopPage.jsx` + `ProductCard.jsx` + `ProductDetailPage.jsx` to real data

**Files:**
- Modify: `frontend/src/pages/ShopPage.jsx`
- Modify: `frontend/src/components/ProductCard.jsx`
- Modify: `frontend/src/pages/ProductDetailPage.jsx`
- Test: `frontend/src/pages/ShopPage.test.jsx` (new)
- Test: `frontend/src/pages/ProductDetailPage.test.jsx` (new)

**Interfaces:**
- Consumes: `useProducts()` (Task 4) → `{ products, error, findProduct }`.
- Produces: no new exports — these are existing pages/components switched from a static import to a shared fetch. Product objects flowing through now carry `slug` (not `id`) and `price_cents`/`original_price_cents` (not `priceCents`/`originalPriceCents`) — every consumer in this task uses destructuring aliases (`const { price_cents: priceCents } = product`) to keep the rest of each function's logic unchanged.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/ShopPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { ShopPage } from './ShopPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', description: 'Over-ear comfort.', price_cents: 14999, original_price_cents: null, colorways: [], icon: 'headphones' },
  { slug: 'keyboard', name: 'Mechanical Keyboard', category: 'Peripherals', description: 'Tactile switches.', price_cents: 8999, original_price_cents: 11999, colorways: [], icon: 'keyboard' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsProvider>
        <ShopPage />
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders products fetched from the real API', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
});

it('derives the category filter list from the fetched products', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
  expect(await screen.findByRole('button', { name: 'Audio' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Peripherals' })).toBeInTheDocument();
});

it('shows the correct discounted price using price_cents/original_price_cents', async () => {
  renderPage();
  expect(await screen.findByText('$89.99')).toBeInTheDocument();
  expect(screen.getByText('$119.99')).toBeInTheDocument();
});
```

```jsx
// frontend/src/pages/ProductDetailPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { ProductDetailPage } from './ProductDetailPage.jsx';

// cloud-shift-runner is the one product with a PRODUCT_DETAILS entry
// (frontend/src/data/productDetails.js) - ProductDetailPage renders
// nothing real for a slug without one (it redirects to /shop), so this is
// the only slug worth testing against here.
const PRODUCT = {
  slug: 'cloud-shift-runner',
  name: 'Cloud Shift Runner',
  category: 'Sneakers',
  description: 'Daily road runner.',
  price_cents: 9600,
  original_price_cents: 12800,
  colorways: [{ id: 'cherry', label: 'Cherry', hex: '#c81e3a' }],
  icon: 'sneaker',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/shop/cloud-shift-runner']}>
      <ProductsProvider>
        <Routes>
          <Route path="/shop/:productId" element={<ProductDetailPage />} />
        </Routes>
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: [PRODUCT] }) }));
});

it('renders the product fetched from the real API by slug', async () => {
  renderPage();
  expect(await screen.findByText('Cloud Shift Runner')).toBeInTheDocument();
  expect(screen.getByText('$96.00')).toBeInTheDocument();
  expect(screen.getByText('$128.00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- ShopPage ProductDetailPage`
Expected: FAIL — pages still read the static `SHOP_PRODUCTS` import, so the mocked `fetch` data never reaches them.

- [ ] **Step 3: Convert `ProductCard.jsx`**

Replace the import (line 4):

```js
import { PRODUCT_DETAILS } from '../data/productDetails.js';
```

stays unchanged — `PRODUCT_DETAILS` is still keyed by the same string values (`'headphones'`, `'cloud-shift-runner'`, etc.), which are now `product.slug` instead of `product.id`, so only the *lookup key* changes below, not this import.

Replace line 24:

```js
  const { name, category, description, priceCents, originalPriceCents, colorways } = product;
```

with:

```js
  const { name, category, description, price_cents: priceCents, original_price_cents: originalPriceCents, colorways } = product;
```

Replace line 184 (`PRODUCT_DETAILS[product.id]`) and line 185 (`to={\`/shop/${product.id}\`}`):

```jsx
        {PRODUCT_DETAILS[product.slug] ? (
          <Link to={`/shop/${product.slug}`} className="product-card-heading product-card-heading-link">
```

- [ ] **Step 4: Convert `ShopPage.jsx`**

Replace the import (line 5):

```js
import { SHOP_PRODUCTS, DEFAULT_WISHLISTED_IDS } from '../data/shopProducts.js';
```

with:

```js
import { DEFAULT_WISHLISTED_IDS } from '../data/shopProducts.js';
import { useProducts } from '../context/ProductsContext.jsx';
```

Replace line 16 (`CATEGORIES` derived from the static array) — this moves inside the component, since it now depends on fetched data:

Remove:
```js
const CATEGORIES = [...new Set(SHOP_PRODUCTS.map((p) => p.category))];
```

Replace `sortProducts` (lines 18-25) — `priceCents` becomes `price_cents`:

```js
function sortProducts(products, sortKey) {
  if (sortKey === 'newest') return products;
  const sorted = [...products];
  if (sortKey === 'price-asc') sorted.sort((a, b) => a.price_cents - b.price_cents);
  else if (sortKey === 'price-desc') sorted.sort((a, b) => b.price_cents - a.price_cents);
  else if (sortKey === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}
```

At the top of `ShopPage()` (after line 34's existing `useState` calls), add:

```js
  const { products } = useProducts();
  const visibleCategories = products ? [...new Set(products.map((p) => p.category))] : [];
```

Replace `visibleProducts` (lines 44-47):

```js
  const visibleProducts = useMemo(() => {
    if (!products) return [];
    const filtered = activeCategory ? products.filter((p) => p.category === activeCategory) : products;
    return sortProducts(filtered, sortKey);
  }, [products, activeCategory, sortKey]);
```

Replace `CATEGORIES.map(...)` (line 132) with `visibleCategories.map(...)`.

Replace the three `product.id` references in the grid render (lines 149, 151, 152):

```jsx
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.slug}
            product={product}
            wishlisted={wishlisted.has(product.slug)}
            onToggleWishlist={() => toggleWishlist(product.slug)}
          />
        ))}
```

- [ ] **Step 5: Convert `ProductDetailPage.jsx`**

Replace the import (line 5):

```js
import { SHOP_PRODUCTS } from '../data/shopProducts.js';
```

with:

```js
import { useProducts } from '../context/ProductsContext.jsx';
```

Replace lines 29-30:

```js
  const { productId } = useParams();
  const product = SHOP_PRODUCTS.find((p) => p.id === productId);
```

with:

```js
  const { productId } = useParams();
  const { findProduct } = useProducts();
  const product = findProduct(productId);
```

Replace line 68 (add the same destructuring-alias pattern):

```js
  const { name, category, description, price_cents: priceCents, original_price_cents: originalPriceCents, colorways, icon } = product;
```

- [ ] **Step 6: Run to verify tests pass**

Run: `npm --prefix frontend test -- ShopPage ProductDetailPage`
Expected: PASS (6 tests total)

- [ ] **Step 7: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ShopPage.jsx frontend/src/components/ProductCard.jsx frontend/src/pages/ProductDetailPage.jsx frontend/src/pages/ShopPage.test.jsx frontend/src/pages/ProductDetailPage.test.jsx
git commit -m "Convert ShopPage, ProductCard, and ProductDetailPage to real product data"
```

---

### Task 6: Convert `BagPage.jsx` + `WishlistPage.jsx`, remove the dead static catalog export

**Files:**
- Modify: `frontend/src/pages/BagPage.jsx`
- Modify: `frontend/src/pages/WishlistPage.jsx`
- Modify: `frontend/src/data/shopProducts.js` (remove the now-unused `SHOP_PRODUCTS` export)
- Test: `frontend/src/pages/BagPage.test.jsx` (new)
- Test: `frontend/src/pages/WishlistPage.test.jsx` (new)

**Interfaces:**
- Consumes: `useProducts()` (Task 4).
- Produces: no new exports.

After Task 5, the only remaining consumers of `SHOP_PRODUCTS` are `BagPage.jsx` and `WishlistPage.jsx` (`ShopNowDialog.jsx`, `productDetails.js`, and `index.css` only mention it in comments, not real imports — confirmed by `grep -rl "SHOP_PRODUCTS" frontend/src`). Once these two are converted, `shopProducts.js`'s `SHOP_PRODUCTS` export is dead code; `DEFAULT_WISHLISTED_IDS` stays (it's unrelated wishlist-seed content, not catalog data).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/BagPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { BagPage } from './BagPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', description: 'Over-ear comfort.', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', description: 'Tactile switches.', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'cable', name: 'USB-C Charging Cable (3-pack)', description: 'Fast-charging cables.', price_cents: 1999, icon: 'cable', colorways: [] },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsProvider>
        <CartProvider>
          <BagPage />
        </CartProvider>
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders cart items using real product data looked up by slug', async () => {
  renderPage();
  // CartContext's own INITIAL_CART_ITEMS seeds headphones/keyboard/cable -
  // all three now resolve against the fetched product list, not static data.
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
});

it('computes the item price from price_cents', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByText('$149.99')).toBeInTheDocument();
});
```

```jsx
// frontend/src/pages/WishlistPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { WishlistPage } from './WishlistPage.jsx';

// wishlistItems.js's real WISHLIST_ITEMS seeds headphones/keyboard/chair -
// all three need a matching fetched product for findProduct to resolve.
const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', category: 'Peripherals', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'chair', name: 'Ergonomic Office Chair', category: 'Office', price_cents: 24999, icon: 'chair', colorways: [] },
];

function renderPage() {
  return render(
    <ProductsProvider>
      <CartProvider>
        <WishlistPage />
      </CartProvider>
    </ProductsProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders wishlist entries using real product data looked up by slug', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Ergonomic Office Chair')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- BagPage WishlistPage`
Expected: FAIL — both pages still read the static `SHOP_PRODUCTS` import directly, so nothing renders from the mocked fetch (the components crash or render blank since `findProduct` isn't in scope yet).

- [ ] **Step 3: Convert `BagPage.jsx`**

Replace the import (line 17):

```js
import { SHOP_PRODUCTS } from '../data/shopProducts.js';
```

with:

```js
import { useProducts } from '../context/ProductsContext.jsx';
```

Remove the module-level helper (lines 33-35):

```js
function findProduct(productId) {
  return SHOP_PRODUCTS.find((p) => p.id === productId);
}
```

Inside `BagPage()`, right after the existing `const { items, setItems } = useCart();` (line 88), add:

```js
  const { findProduct } = useProducts();
```

Every existing call site (`findProduct(item.productId)`, `findProduct(it.productId)`, `findProduct(confirmProductId)`, `findProduct(productId)` inside `completeRemoval`) is already inside the component body, so no other call sites need to change — they now resolve against `useProducts()`'s `findProduct` instead of the removed module-level one.

Replace the two `.priceCents` reads: line 200 (`findProduct(it.productId).priceCents * it.qty`) and line 284 (`formatCents(product.priceCents * item.qty)`) — both become `.price_cents`:

```js
  const subtotalCents = selectedItems.reduce((sum, it) => sum + findProduct(it.productId).price_cents * it.qty, 0);
```

```jsx
                      <div className="cart-item-price">{formatCents(product.price_cents * item.qty)}</div>
```

- [ ] **Step 4: Convert `WishlistPage.jsx`**

Replace the import (line 5):

```js
import { SHOP_PRODUCTS } from '../data/shopProducts.js';
```

with:

```js
import { useProducts } from '../context/ProductsContext.jsx';
```

Remove the module-level helper (lines 9-11):

```js
function findProduct(productId) {
  return SHOP_PRODUCTS.find((p) => p.id === productId);
}
```

Inside `WishlistPage()`, right after the existing `const { setItems } = useCart();` (line 20), add:

```js
  const { findProduct } = useProducts();
```

Replace the `priceDropped`/`price_cents` comparison inside the `entries` `useMemo` (lines 27-40):

```js
  const entries = useMemo(
    () =>
      WISHLIST_ITEMS.map((saved) => {
        const product = findProduct(saved.productId);
        const priceDropped = saved.savedAtCents > product.price_cents;
        return {
          ...saved,
          product,
          priceDropped,
          savingsCents: priceDropped ? saved.savedAtCents - product.price_cents : 0,
        };
      }),
    [findProduct]
  );
```

(The dependency array changes from `[]` to `[findProduct]` — `findProduct` closes over `products`, which starts `null` and becomes the real array once the fetch resolves, so `entries` needs to recompute once that happens.)

Replace the `product.id` references in `handleAddToCart` (lines 54, 61):

```js
  function handleAddToCart(entry) {
    const { product } = entry;
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.slug);
      if (existing) {
        return prev.map((it) => (it.productId === product.slug ? { ...it, qty: it.qty + 1 } : it));
      }
      return [
        ...prev,
        {
          productId: product.slug,
          colorLabel: product.colorways[0]?.label ?? '',
          qty: 1,
          fulfillment: 'delivery',
          surchargeCents: 0,
          selected: true,
        },
      ];
    });
    setAddedIds((prev) => new Set(prev).add(product.slug));
  }
```

Replace the remaining `product.id`/`product.priceCents` references in the render (lines 113, 124, 137):

```jsx
              <div className="wishlist-cell" key={product.slug}>
```

```jsx
                  <p className="wishlist-card-price">
                    {formatCents(product.price_cents)}
```

```jsx
                    {addedIds.has(product.slug) ? 'Added' : 'Add To Cart'}
```

- [ ] **Step 5: Remove the dead `SHOP_PRODUCTS` export from `shopProducts.js`**

Read the current file first — remove the `export const SHOP_PRODUCTS = [...]` block entirely, keep `export const DEFAULT_WISHLISTED_IDS = ['keyboard'];` and update the file's own top comment (it currently explains why `SHOP_PRODUCTS` exists) to reflect that only wishlist-seed data remains:

```js
// DEFAULT_WISHLISTED_IDS seeds ShopPage's wishlist Set - unrelated to
// catalog data (see ProductsContext.jsx for the real product catalog,
// which replaced this file's old SHOP_PRODUCTS static array). The keyboard
// starts pre-wishlisted, mirroring the reference screenshot's own layout
// (its one discounted card is also the one with an already-filled heart).
export const DEFAULT_WISHLISTED_IDS = ['keyboard'];
```

- [ ] **Step 6: Run to verify tests pass**

Run: `npm --prefix frontend test -- BagPage WishlistPage`
Expected: PASS (3 tests total)

- [ ] **Step 7: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions (confirms nothing else still imports the removed `SHOP_PRODUCTS` export)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/BagPage.jsx frontend/src/pages/WishlistPage.jsx frontend/src/data/shopProducts.js frontend/src/pages/BagPage.test.jsx frontend/src/pages/WishlistPage.test.jsx
git commit -m "Convert BagPage and WishlistPage to real product data, remove dead static catalog"
```

---

### Task 7: `AdminProductsPage.jsx` — admin product list

**Files:**
- Create: `frontend/src/pages/AdminProductsPage.jsx`
- Test: `frontend/src/pages/AdminProductsPage.test.jsx`
- Modify: `frontend/src/index.css` (append two small new classes)

**Interfaces:**
- Consumes: `useAdminAuth` (existing); fetches `GET /api/products` (Task 3, public — but this page itself still sits behind `AdminProtectedRoute` since it's part of the admin panel; the endpoint being public doesn't make the page itself public).
- Produces: `export function AdminProductsPage()` — consumed by `App.jsx` in Task 8 at `/admin/products`.

Reuses `.admin-orders-page`, `.admin-orders-toolbar`, `.admin-orders-search`, `.admin-orders-table`, `.verify-error`, `.sr-only`. Two small new classes are needed for the "New Product" link, styled to match `.admin-nav-logout`'s button-like appearance without reusing a class scoped to the nav bar.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/AdminProductsPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductsPage } from './AdminProductsPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', sku: 'AUD-HP-001', category: 'Audio', price_cents: 14999, stock_quantity: 42 },
  { slug: 'keyboard', name: 'Mechanical Keyboard', sku: 'PER-KB-002', category: 'Peripherals', price_cents: 8999, stock_quantity: 18 },
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
    if (url === '/api/products') return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
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

it('filters by name, SKU, or category client-side', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.change(screen.getByLabelText(/search products/i), { target: { value: 'PER-KB' } });
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
  expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up products.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminProductsPage`
Expected: FAIL — `Failed to resolve import "./AdminProductsPage.jsx"`

- [ ] **Step 3: Implement `AdminProductsPage.jsx`**

```jsx
// frontend/src/pages/AdminProductsPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

export function AdminProductsPage() {
  const { logout } = useAdminAuth();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/products')
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
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = q.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      )
    : products;

  return (
    <div className="admin-orders-page">
      <h1>Products</h1>

      <div className="admin-orders-toolbar">
        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-products-search" className="sr-only">
            Search products by name, SKU, or category
          </label>
          <input
            id="admin-products-search"
            type="text"
            placeholder="Search by name, SKU, or category..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Link to="/admin/products/new" className="admin-products-new-link">
          New Product
        </Link>
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
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.slug}>
                <td>
                  <Link to={`/admin/products/${product.slug}/edit`}>{product.name}</Link>
                </td>
                <td>{product.sku}</td>
                <td>{product.category}</td>
                <td>{formatCents(product.price_cents)}</td>
                <td>{product.stock_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm --prefix frontend test -- AdminProductsPage`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the "New Product" link style to `frontend/src/index.css`**

Append after the existing `.admin-nav-logout` rule:

```css
.admin-products-new-link {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-decoration: none;
  white-space: nowrap;
}

.admin-products-new-link:hover {
  background: var(--color-surface-hover);
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AdminProductsPage.jsx frontend/src/pages/AdminProductsPage.test.jsx frontend/src/index.css
git commit -m "Add AdminProductsPage: searchable product list"
```

---

### Task 8: `AdminProductFormPage.jsx`, wire everything into `App.jsx`/`AdminNav`, manual verification

**Files:**
- Create: `frontend/src/pages/AdminProductFormPage.jsx`
- Test: `frontend/src/pages/AdminProductFormPage.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AdminNav.jsx`
- Modify: `frontend/src/index.css` (append form-page styles)

**Interfaces:**
- Consumes: `GET /api/products/:slug`, `POST /api/admin/products`, `PATCH /api/admin/products/:slug`, `DELETE /api/admin/products/:slug` (Task 3).
- Produces: `export function AdminProductFormPage()` — consumed by `App.jsx` at `/admin/products/new` and `/admin/products/:slug/edit`.

Colorways are not editable through this form in this pass (Global Constraints) — new products are created with `colorways: []` implicitly (the field is simply omitted from the request body, and the backend's `createProduct` already defaults it to `[]`).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/AdminProductFormPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductFormPage } from './AdminProductFormPage.jsx';

const EXISTING_PRODUCT = {
  slug: 'headphones',
  name: 'Wireless Noise-Cancelling Headphones',
  description: 'Over-ear comfort.',
  category: 'Audio',
  price_cents: 14999,
  original_price_cents: null,
  cover_image_url: null,
  icon: 'headphones',
  sku: 'AUD-HP-001',
  stock_quantity: 42,
  colorways: [],
};

function renderForm(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:slug/edit" element={<AdminProductFormPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders an empty form for a new product', async () => {
  renderForm('/admin/products/new');
  expect(await screen.findByLabelText(/^name$/i)).toHaveValue('');
  expect(screen.getByLabelText(/^slug$/i)).toBeInTheDocument();
});

it('pre-fills the form with the existing product on edit', async () => {
  renderForm('/admin/products/headphones/edit');
  expect(await screen.findByLabelText(/^name$/i)).toHaveValue('Wireless Noise-Cancelling Headphones');
  expect(screen.getByLabelText(/^sku$/i)).toHaveValue('AUD-HP-001');
  expect(screen.queryByLabelText(/^slug$/i)).not.toBeInTheDocument();
});

it('submits a POST with the entered fields when creating', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/products' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ slug: 'new-item' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/new');
  await screen.findByLabelText(/^name$/i);
  fireEvent.change(screen.getByLabelText(/^slug$/i), { target: { value: 'new-item' } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'New Item' } });
  fireEvent.change(screen.getByLabelText(/^category$/i), { target: { value: 'Accessories' } });
  fireEvent.change(screen.getByLabelText(/price \(cents\)/i), { target: { value: '1999' } });
  fireEvent.change(screen.getByLabelText(/^sku$/i), { target: { value: 'ACC-NI-999' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u]) => u === '/api/admin/products');
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ slug: 'new-item', name: 'New Item', category: 'Accessories', price_cents: 1999, sku: 'ACC-NI-999' });
  });
});

it('submits a PATCH when editing an existing product', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    if (url === '/api/admin/products/headphones' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...EXISTING_PRODUCT, name: 'Updated Name' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/headphones/edit');
  await screen.findByDisplayValue('Wireless Noise-Cancelling Headphones');
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Updated Name' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/products/headphones' && o?.method === 'PATCH');
    expect(call).toBeTruthy();
  });
});

it('deletes the product when Delete is clicked on the edit form', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    if (url === '/api/admin/products/headphones' && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/headphones/edit');
  await screen.findByDisplayValue('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /delete product/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/products/headphones' && o?.method === 'DELETE');
    expect(call).toBeTruthy();
  });
});

it('surfaces an error when saving fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (opts?.method === 'POST') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'sku already exists.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/new');
  await screen.findByLabelText(/^name$/i);
  fireEvent.change(screen.getByLabelText(/^slug$/i), { target: { value: 'dup' } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Dup' } });
  fireEvent.change(screen.getByLabelText(/^category$/i), { target: { value: 'Accessories' } });
  fireEvent.change(screen.getByLabelText(/price \(cents\)/i), { target: { value: '1000' } });
  fireEvent.change(screen.getByLabelText(/^sku$/i), { target: { value: 'DUP-1' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/sku already exists/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend test -- AdminProductFormPage`
Expected: FAIL — `Failed to resolve import "./AdminProductFormPage.jsx"`

- [ ] **Step 3: Implement `AdminProductFormPage.jsx`**

```jsx
// frontend/src/pages/AdminProductFormPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const EMPTY_FORM = {
  slug: '',
  name: '',
  description: '',
  category: '',
  price_cents: '',
  original_price_cents: '',
  cover_image_url: '',
  icon: '',
  sku: '',
  stock_quantity: '',
};

export function AdminProductFormPage() {
  const { logout } = useAdminAuth();
  const { slug } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(slug);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    fetch(`/api/products/${slug}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading that product.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setForm({
          slug: data.slug,
          name: data.name,
          description: data.description || '',
          category: data.category,
          price_cents: String(data.price_cents),
          original_price_cents: data.original_price_cents != null ? String(data.original_price_cents) : '',
          cover_image_url: data.cover_image_url || '',
          icon: data.icon || '',
          sku: data.sku,
          stock_quantity: String(data.stock_quantity),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, isEdit]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      description: form.description || null,
      category: form.category,
      price_cents: Number(form.price_cents),
      original_price_cents: form.original_price_cents ? Number(form.original_price_cents) : null,
      cover_image_url: form.cover_image_url || null,
      icon: form.icon || null,
      sku: form.sku,
      stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : 0,
    };
    if (!isEdit) body.slug = form.slug;

    try {
      const res = await fetch(isEdit ? `/api/admin/products/${slug}` : '/api/admin/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || 'Something went wrong saving that product.');
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${slug}`, { method: 'DELETE' });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong deleting that product.');
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="admin-product-form-page">
      <h1>{isEdit ? `Edit ${form.name}` : 'New Product'}</h1>

      <form onSubmit={handleSubmit}>
        {!isEdit && (
          <>
            <label htmlFor="admin-product-slug">Slug</label>
            <input
              id="admin-product-slug"
              type="text"
              value={form.slug}
              onChange={(e) => updateField('slug', e.target.value)}
              required
            />
          </>
        )}

        <label htmlFor="admin-product-name">Name</label>
        <input id="admin-product-name" type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />

        <label htmlFor="admin-product-description">Description</label>
        <input
          id="admin-product-description"
          type="text"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
        />

        <label htmlFor="admin-product-category">Category</label>
        <input
          id="admin-product-category"
          type="text"
          value={form.category}
          onChange={(e) => updateField('category', e.target.value)}
          required
        />

        <label htmlFor="admin-product-price">Price (cents)</label>
        <input
          id="admin-product-price"
          type="number"
          min="0"
          value={form.price_cents}
          onChange={(e) => updateField('price_cents', e.target.value)}
          required
        />

        <label htmlFor="admin-product-original-price">Original price (cents, optional)</label>
        <input
          id="admin-product-original-price"
          type="number"
          min="0"
          value={form.original_price_cents}
          onChange={(e) => updateField('original_price_cents', e.target.value)}
        />

        <label htmlFor="admin-product-cover-image">Cover image URL</label>
        <input
          id="admin-product-cover-image"
          type="text"
          value={form.cover_image_url}
          onChange={(e) => updateField('cover_image_url', e.target.value)}
        />

        <label htmlFor="admin-product-icon">Icon key</label>
        <input id="admin-product-icon" type="text" value={form.icon} onChange={(e) => updateField('icon', e.target.value)} />

        <label htmlFor="admin-product-sku">SKU</label>
        <input id="admin-product-sku" type="text" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} required />

        <label htmlFor="admin-product-stock">Stock quantity</label>
        <input
          id="admin-product-stock"
          type="number"
          min="0"
          value={form.stock_quantity}
          onChange={(e) => updateField('stock_quantity', e.target.value)}
        />

        <div className="admin-product-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isEdit && (
            <button type="button" className="admin-product-delete-btn" onClick={handleDelete} disabled={saving}>
              Delete Product
            </button>
          )}
        </div>
      </form>

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

Run: `npm --prefix frontend test -- AdminProductFormPage`
Expected: PASS (6 tests)

- [ ] **Step 5: Add a third "Products" tab to `AdminNav.jsx`**

Read the current file first. Add a third `NavLink` between the existing Orders and Customers links:

```jsx
        <NavLink
          to="/admin/products"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Products
        </NavLink>
```

(This one doesn't need the `ordersActive`-style manual override — `/admin/products` and `/admin/products/:slug/edit`/`/admin/products/new` are all real, distinct paths under `/admin/products`, and `NavLink`'s own prefix-matching `isActive` — without `end` — already highlights correctly on all three, the same way the existing Customers link already works on its own detail page.)

- [ ] **Step 6: Wire both new pages into `frontend/src/App.jsx`**

Add a new lazy import, alongside the existing `AdminCustomerDetailPage` one:

```jsx
const AdminProductsPage = lazy(() =>
  import('./pages/AdminProductsPage.jsx').then((m) => ({ default: m.AdminProductsPage }))
);
const AdminProductFormPage = lazy(() =>
  import('./pages/AdminProductFormPage.jsx').then((m) => ({ default: m.AdminProductFormPage }))
);
```

Add two new routes inside the existing `<Route element={<AdminNav />}>` block, alongside the `customers`/`customers/:email` routes:

```jsx
                  <Route path="products" element={<AdminProductsPage />} />
                  <Route path="products/new" element={<AdminProductFormPage />} />
                  <Route path="products/:slug/edit" element={<AdminProductFormPage />} />
```

- [ ] **Step 7: Add form-page styles to `frontend/src/index.css`**

Append after the `.admin-products-new-link:hover` rule from Task 7:

```css
.admin-product-form-page {
  padding: var(--space-4);
  max-width: 480px;
}

.admin-product-form-page form {
  display: flex;
  flex-direction: column;
}

.admin-product-form-page label {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.admin-product-form-page input {
  padding: 0.5rem 0.75rem;
  margin-top: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-product-form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.admin-product-delete-btn {
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-md);
  background: var(--color-error-surface);
  color: var(--color-error-text);
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}
```

- [ ] **Step 8: Run both full test suites**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions

Run:
```
ANTHROPIC_API_KEY=test-key-for-ci DATABASE_URL=postgresql://test:test@localhost:5432/test JWT_SECRET=test-secret-for-ci RATE_LIMIT_MAX=20 RATE_LIMIT_WINDOW_MS=60000 RATE_LIMIT_ORDERS_MAX=20 RATE_LIMIT_ORDERS_WINDOW_MS=60000 RATE_LIMIT_AUTH_MAX=20 RATE_LIMIT_AUTH_WINDOW_MS=60000 RATE_LIMIT_ADMIN_LOGIN_MAX=20 RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS=60000 LOG_LEVEL=silent npm test
```
Expected: PASS, no regressions

- [ ] **Step 9: Manual verification in the browser**

Start both servers if not already running, sign in at `/admin/login`, and confirm:
- A "Products" tab appears in the admin nav, correctly highlighted on `/admin/products` and its sub-routes.
- `/admin/products` shows the real 6 seeded products (name, SKU, category, price, stock).
- Clicking a product opens its edit form pre-filled with real data; changing a field and saving updates it, and the list reflects the change on return.
- "New Product" creates a real product with a unique slug/SKU; visiting `/shop` afterward shows it in the real storefront grid.
- Deleting a product removes it from both the admin list and `/shop`.
- On the customer-facing side: `/shop` shows all 6 real products with correct prices/discounts/categories; clicking into "Cloud Shift Runner" (the one with a real detail page) shows its real price/colorways from the database; `/bag` and `/wishlist` render their seeded items using real product names/prices/images looked up by slug, not stale static data.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/AdminProductFormPage.jsx frontend/src/pages/AdminProductFormPage.test.jsx frontend/src/components/AdminNav.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add AdminProductFormPage, wire products into AdminNav and App.jsx"
```

---

## Post-Plan Notes (not part of this plan's scope)

- Per-variant stock (colorway/size-level inventory) and low-stock warnings — the next sub-project in this roadmap line.
- A real, backend-synced cart / stock reservations or locks — a separate, still-unbuilt project; this plan only makes the *products* a cart can reference real, not the cart itself.
- Wiring `cover_image_url` into actual image rendering (`ProductImage.jsx`, `ProductDetailPage`'s hero) — the field is persisted and admin-editable, but the storefront still renders via the existing icon-keyed static photo map.
- File upload for `cover_image_url`, colorway editing in the admin form, draft/unpublished products — none of these were asked for.
- RBAC/permissions, Store & Payment Settings — remaining, not-yet-built Phase 1 sub-projects.
