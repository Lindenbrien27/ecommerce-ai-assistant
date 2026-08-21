# Admin Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, DB-backed Inventory section (Stock Ledger, Reorder Queue, Purchase Orders) to admin, tied to the app's 6 real products, following every existing admin-page convention exactly.

**Architecture:** One new DB migration (4 tables + seed data) → one backend resource (`adminInventoryService`/`Controller`/`Routes.js`, 3 read endpoints, mounted at `/api/admin/inventory`) → 3 new icons → an `AdminNav.jsx` rework (adds an expandable "Inventory" group, drops the sliding-pill indicator for a plain active-background) → 3 new frontend pages, each a straight structural copy of `AdminProductsPage.jsx`'s toolbar/table/pager pattern with its own field set and its own `admin-inventory-*`/`admin-reorder-*`/`admin-po-*` CSS prefix (fixed-dark palette, matching Orders/Products/Promo Codes — not the theme-aware palette `AdminDashboardPage` happens to use).

**Tech Stack:** Express + `pg` (raw SQL, no ORM), `node-pg-migrate` migrations, React 18 + react-router-dom, Vitest + Testing Library.

## Global Constraints
- Every new endpoint is read-only (`GET` only) and mounted behind `requireAdminAuth` exactly like every existing `/api/admin/*` resource.
- No row actions, no Export, no create/edit/receive UI, no separate Locations/Suppliers CRUD pages — this plan builds exactly the 3 read+filter pages from the approved spec (`docs/superpowers/specs/2026-08-17-admin-inventory-design.md`) and nothing else.
- `avg_daily_units_sold` and `reorder_point` are seeded static numbers (same honesty level as `products.stock_quantity` already is — admin-set, not live-computed), because this app has no real per-unit sales history to derive them from.
- Money renders via the existing `formatCents()` (`frontend/src/utils/pricing.js`).
- Product photos/icons render via the existing `<ProductImage icon={...} size="sm" />` (`frontend/src/components/ProductImage.jsx`), keyed by the product's `icon` column — never a new image component.
- Pagination follows `adminProductService.getAdminProducts`'s exact shape: `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` from `src/services/orderService.js`, `page`/`pageSize` clamped the same way, `parsePositiveInt` validation in the controller returning `400` on a non-positive-integer `page`/`pageSize`.

---

### Task 1: Migration — schema + seed data

**Files:**
- Create: `migrations/<timestamp>_add-inventory-tables.sql` (use `date +%s%3N` or similar for a fresh 13-digit timestamp prefix, following the existing filename convention, e.g. `1786768155871_add-products-table.sql`)

**Interfaces:**
- Produces: tables `inventory_locations(id, name)`, `suppliers(id, name, lead_time_days)`, `inventory_items(id, product_slug, location_id, sku_code, on_hand, allocated, reorder_point, avg_daily_units_sold, supplier_id, created_at)`, `purchase_orders(id, po_number, supplier_id, receive_into_location_id, status, expected_date, received_date, created_at)`, `purchase_order_items(id, purchase_order_id, inventory_item_id, quantity, unit_cost_cents)` — consumed by Task 2's SQL queries.

- [ ] **Step 1: Write the migration file**

```sql
-- Up Migration

CREATE TABLE inventory_locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  lead_time_days INTEGER NOT NULL
);

CREATE TABLE inventory_items (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  sku_code TEXT NOT NULL UNIQUE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  allocated INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  avg_daily_units_sold NUMERIC NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_slug, location_id)
);

CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  receive_into_location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'received', 'cancelled')),
  expected_date DATE,
  received_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL
);

INSERT INTO inventory_locations (id, name) VALUES
  (1, 'Main Warehouse'), (2, 'East DC'), (3, 'Store-Brooklyn');
SELECT setval('inventory_locations_id_seq', 3);

INSERT INTO suppliers (id, name, lead_time_days) VALUES
  (1, 'Atlas Wholesale', 16), (2, 'Cedar Logistics', 12), (3, 'Harbor Supply Co.', 20);
SELECT setval('suppliers_id_seq', 3);

INSERT INTO inventory_items (id, product_slug, location_id, sku_code, on_hand, allocated, reorder_point, avg_daily_units_sold, supplier_id) VALUES
  (1, 'headphones', 1, 'AUD-HP-001-MW', 42, 4, 20, 1.8, 1),
  (2, 'headphones', 2, 'AUD-HP-001-EDC', 6, 1, 15, 1.2, 2),
  (3, 'keyboard', 1, 'PER-KB-002-MW', 18, 0, 12, 0.9, 1),
  (4, 'keyboard', 3, 'PER-KB-002-SB', 0, 0, 8, 0.5, 2),
  (5, 'chair', 1, 'WRK-CH-003-MW', 7, 1, 6, 0.3, 3),
  (6, 'chair', 2, 'WRK-CH-003-EDC', 12, 0, 5, 0.2, 3),
  (7, 'monitor', 1, 'DIS-MN-004-MW', 23, 3, 10, 0.8, 1),
  (8, 'monitor', 3, 'DIS-MN-004-SB', 0, 0, 6, 0.4, 2),
  (9, 'cable', 1, 'ACC-CB-005-MW', 156, 10, 40, 5.5, 3),
  (10, 'cable', 2, 'ACC-CB-005-EDC', 30, 2, 35, 3.0, 3),
  (11, 'cloud-shift-runner', 1, 'SNK-CS-006-MW', 31, 5, 15, 1.5, 1),
  (12, 'cloud-shift-runner', 3, 'SNK-CS-006-SB', 2, 0, 10, 0.7, 1);
SELECT setval('inventory_items_id_seq', 12);

INSERT INTO purchase_orders (id, po_number, supplier_id, receive_into_location_id, status, expected_date, received_date) VALUES
  (1, 'PO-1001', 1, 1, 'draft', '2026-09-05', NULL),
  (2, 'PO-1002', 2, 3, 'draft', '2026-09-02', NULL),
  (3, 'PO-1003', 3, 2, 'received', NULL, '2026-08-10'),
  (4, 'PO-1004', 2, 1, 'cancelled', '2026-08-15', NULL);
SELECT setval('purchase_orders_id_seq', 4);

INSERT INTO purchase_order_items (purchase_order_id, inventory_item_id, quantity, unit_cost_cents) VALUES
  (1, 2, 40, 9000),
  (1, 12, 30, 6200),
  (2, 4, 60, 5000),
  (3, 8, 20, 18000),
  (4, 10, 100, 800);

-- Down Migration

DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS inventory_items;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS inventory_locations;
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate up` (check `package.json` for the exact script name if this doesn't match — follow whatever the other migrations in this repo are run with).
Expected: migration applies with no errors.

- [ ] **Step 3: Sanity-check the seed data**

Run: `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM inventory_items;"` (or equivalent for however this repo connects locally)
Expected: `12`.

- [ ] **Step 4: Commit**

```bash
git add migrations/
git commit -m "Add inventory_locations, suppliers, inventory_items, purchase_orders tables + seed data"
```

---

### Task 2: Backend service — `adminInventoryService.js`

**Files:**
- Create: `src/services/adminInventoryService.js`

**Interfaces:**
- Consumes: `pool` (`src/config/db.js`), `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` (`src/services/orderService.js`).
- Produces: `getStockLedger({ q, category, location, supplier, status, page, pageSize })`, `getReorderQueue({ q, urgency, supplier, page, pageSize })`, `getPurchaseOrders({ q, status, page, pageSize })` — all async, all returning plain objects per the shapes below. Consumed by Task 3's controller.

- [ ] **Step 1: Write `src/services/adminInventoryService.js`**

```javascript
const { pool } = require('../config/db');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

// status/available/days_of_cover are derived per row, never stored - same
// reasoning as adminProductService's own stockBadge equivalent on the
// frontend, just computed here in SQL since every one of the 3 endpoints
// below needs it (the frontend's per-page stockBadge() only had one caller).
const ITEM_COLUMNS = `
  i.id, i.product_slug, p.name AS product_name, p.category, p.icon, p.price_cents,
  l.id AS location_id, l.name AS location_name,
  i.sku_code, i.on_hand, i.allocated, (i.on_hand - i.allocated) AS available,
  i.reorder_point, i.avg_daily_units_sold,
  CASE WHEN i.avg_daily_units_sold > 0 THEN i.on_hand / i.avg_daily_units_sold ELSE NULL END AS days_of_cover,
  CASE
    WHEN i.on_hand = 0 THEN 'out_of_stock'
    WHEN (i.on_hand - i.allocated) <= i.reorder_point THEN 'low_stock'
    ELSE 'in_stock'
  END AS status,
  s.id AS supplier_id, s.name AS supplier_name, s.lead_time_days
`;

const ITEM_JOINS = `
  FROM inventory_items i
  JOIN products p ON p.slug = i.product_slug
  JOIN inventory_locations l ON l.id = i.location_id
  LEFT JOIN suppliers s ON s.id = i.supplier_id
`;

function clamp({ page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE),
  };
}

async function getStockLedger({ q = null, category = null, location = null, supplier = null, status = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const categoriesResult = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  const locationsResult = await pool.query('SELECT id, name FROM inventory_locations ORDER BY name');
  const suppliersResult = await pool.query('SELECT id, name FROM suppliers ORDER BY name');

  const where = `
    WHERE ($1::text IS NULL OR p.category = $1)
      AND ($2::int IS NULL OR l.id = $2)
      AND ($3::int IS NULL OR s.id = $3)
      AND ($4::text IS NULL OR p.name ILIKE $4 OR i.sku_code ILIKE $4)
      AND (
        $5::text IS NULL
        OR ($5 = 'out_of_stock' AND i.on_hand = 0)
        OR ($5 = 'low_stock' AND i.on_hand > 0 AND (i.on_hand - i.allocated) <= i.reorder_point)
        OR ($5 = 'in_stock' AND i.on_hand > 0 AND (i.on_hand - i.allocated) > i.reorder_point)
      )
  `;
  const params = [category, location, supplier, searchTerm, status];

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${ITEM_JOINS} ${where}`, params);
  const total = Number(countResult.rows[0].total);

  const { rows: items } = await pool.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_JOINS} ${where} ORDER BY p.name ASC, l.name ASC LIMIT $6 OFFSET $7`,
    [...params, clamped.pageSize, offset]
  );

  // Stats are computed over the *entire* inventory_items table, not the
  // filtered set - the reference design's stat cards don't move when the
  // table below them is filtered, same as AdminProductsPage's category
  // dropdown always listing every real category regardless of the current
  // filter (see that file's own comment on why).
  const statsResult = await pool.query(`
    SELECT
      COALESCE(SUM(on_hand) FILTER (WHERE avg_daily_units_sold > 0), 0) / NULLIF(SUM(avg_daily_units_sold) FILTER (WHERE avg_daily_units_sold > 0), 0) AS days_of_cover,
      COUNT(*) FILTER (WHERE (on_hand - allocated) <= reorder_point) AS reorder_risk_count,
      COUNT(*) AS total_skus,
      COALESCE(SUM(on_hand), 0) AS units_on_hand,
      COALESCE(SUM(allocated), 0) AS allocated,
      COUNT(*) FILTER (WHERE on_hand = 0) AS out_of_stock_count,
      COUNT(*) FILTER (WHERE on_hand > 0 AND (on_hand - allocated) <= reorder_point) AS low_stock_count,
      COUNT(*) FILTER (WHERE on_hand > 0 AND (on_hand - allocated) > reorder_point) AS in_stock_count
    FROM inventory_items
  `);
  const statsRow = statsResult.rows[0];
  const stockValueResult = await pool.query(`
    SELECT COALESCE(SUM(i.on_hand * p.price_cents), 0) AS total_stock_value_cents
    FROM inventory_items i JOIN products p ON p.slug = i.product_slug
  `);
  const avgLeadTimeResult = await pool.query('SELECT COALESCE(AVG(lead_time_days), 0) AS avg_lead_time_days FROM suppliers');

  return {
    items,
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    categories: categoriesResult.rows.map((r) => r.category),
    locations: locationsResult.rows,
    suppliers: suppliersResult.rows,
    stats: {
      days_of_cover: statsRow.days_of_cover === null ? null : Number(statsRow.days_of_cover),
      avg_lead_time_days: Number(avgLeadTimeResult.rows[0].avg_lead_time_days),
      reorder_risk_count: Number(statsRow.reorder_risk_count),
      total_skus: Number(statsRow.total_skus),
      units_on_hand: Number(statsRow.units_on_hand),
      allocated: Number(statsRow.allocated),
      total_stock_value_cents: Number(stockValueResult.rows[0].total_stock_value_cents),
      out_of_stock_count: Number(statsRow.out_of_stock_count),
      low_stock_count: Number(statsRow.low_stock_count),
      in_stock_count: Number(statsRow.in_stock_count),
    },
  };
}

async function getReorderQueue({ q = null, urgency = null, supplier = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const suppliersResult = await pool.query('SELECT id, name FROM suppliers ORDER BY name');

  const where = `
    WHERE (i.on_hand - i.allocated) <= i.reorder_point
      AND ($1::int IS NULL OR s.id = $1)
      AND ($2::text IS NULL OR p.name ILIKE $2 OR i.sku_code ILIKE $2)
      AND (
        $3::text IS NULL
        OR ($3 = 'out_of_stock' AND i.on_hand = 0)
        OR ($3 = 'low_stock' AND i.on_hand > 0)
      )
  `;
  const params = [supplier, searchTerm, urgency];

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${ITEM_JOINS} ${where}`, params);
  const total = Number(countResult.rows[0].total);

  const { rows: rawItems } = await pool.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_JOINS} ${where}
     ORDER BY (i.reorder_point - (i.on_hand - i.allocated)) DESC, p.name ASC
     LIMIT $4 OFFSET $5`,
    [...params, clamped.pageSize, offset]
  );
  const items = rawItems.map((item) => {
    const deficit = Math.max(0, item.reorder_point - item.available);
    const rawSuggested = item.reorder_point * 2 - item.available;
    const suggested_po_qty = Math.max(10, Math.round(rawSuggested / 10) * 10);
    return { ...item, deficit, suggested_po_qty };
  });

  const statsResult = await pool.query(`
    SELECT
      COUNT(*) AS needing_action_count,
      COUNT(*) FILTER (WHERE i.on_hand = 0) AS out_of_stock_count,
      COUNT(*) FILTER (WHERE i.on_hand > 0) AS low_stock_count,
      COALESCE(SUM((i.on_hand - i.allocated) * p.price_cents), 0) AS at_risk_value_cents
    ${ITEM_JOINS}
    WHERE (i.on_hand - i.allocated) <= i.reorder_point
  `);
  const statsRow = statsResult.rows[0];

  return {
    items,
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    suppliers: suppliersResult.rows,
    stats: {
      needing_action_count: Number(statsRow.needing_action_count),
      out_of_stock_count: Number(statsRow.out_of_stock_count),
      low_stock_count: Number(statsRow.low_stock_count),
      at_risk_value_cents: Number(statsRow.at_risk_value_cents),
    },
  };
}

async function getPurchaseOrders({ q = null, status = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const where = `
    WHERE ($1::text IS NULL OR po.status = $1)
      AND ($2::text IS NULL OR po.po_number ILIKE $2 OR s.name ILIKE $2)
  `;
  const params = [status, searchTerm];

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows: purchaseOrders } = await pool.query(
    `SELECT
       po.id, po.po_number, s.name AS supplier_name, l.name AS receive_into_location,
       po.status, po.expected_date, po.received_date, po.created_at,
       COUNT(poi.id) AS item_count,
       COALESCE(SUM(poi.quantity), 0) AS total_units,
       COALESCE(SUM(poi.quantity * poi.unit_cost_cents), 0) AS total_cents
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN inventory_locations l ON l.id = po.receive_into_location_id
     LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
     ${where}
     GROUP BY po.id, s.name, l.name
     ORDER BY po.created_at DESC
     LIMIT $3 OFFSET $4`,
    [...params, clamped.pageSize, offset]
  );

  const openCountResult = await pool.query("SELECT COUNT(*) AS total FROM purchase_orders WHERE status = 'draft'");

  return {
    purchaseOrders: purchaseOrders.map((po) => ({
      ...po,
      item_count: Number(po.item_count),
      total_units: Number(po.total_units),
      total_cents: Number(po.total_cents),
    })),
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    openCount: Number(openCountResult.rows[0].total),
  };
}

module.exports = { getStockLedger, getReorderQueue, getPurchaseOrders };
```

- [ ] **Step 2: Commit**

```bash
git add src/services/adminInventoryService.js
git commit -m "Add adminInventoryService with stock ledger, reorder queue, purchase order queries"
```

---

### Task 3: Backend controller + routes + app wiring

**Files:**
- Create: `src/controllers/adminInventoryController.js`
- Create: `src/routes/adminInventoryRoutes.js`
- Modify: `src/app.js` (add import + `app.use` line, alongside the other `admin*Routes` imports/mounts)

**Interfaces:**
- Consumes: `adminInventoryService.getStockLedger/getReorderQueue/getPurchaseOrders` (Task 2), `logError` (`src/utils/logger.js`).
- Produces: `GET /api/admin/inventory`, `GET /api/admin/inventory/reorder`, `GET /api/admin/inventory/purchase-orders` — consumed by the 3 frontend pages in Tasks 7–9.

- [ ] **Step 1: Write `src/controllers/adminInventoryController.js`**

```javascript
const adminInventoryService = require('../services/adminInventoryService');
const { logError } = require('../utils/logger');

function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function parsePagination(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    res.status(400).json({ error: 'page must be a positive integer.' });
    return null;
  }
  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    res.status(400).json({ error: 'pageSize must be a positive integer.' });
    return null;
  }
  return { page, pageSize };
}

async function listStockLedger(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  try {
    const result = await adminInventoryService.getStockLedger({
      q: req.query.q || null,
      category: req.query.category || null,
      location: req.query.location ? Number(req.query.location) : null,
      supplier: req.query.supplier ? Number(req.query.supplier) : null,
      status: req.query.status || null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin inventory stock ledger error', err);
    res.status(500).json({ error: 'Something went wrong looking up inventory.' });
  }
}

async function listReorderQueue(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  try {
    const result = await adminInventoryService.getReorderQueue({
      q: req.query.q || null,
      urgency: req.query.urgency || null,
      supplier: req.query.supplier ? Number(req.query.supplier) : null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin inventory reorder queue error', err);
    res.status(500).json({ error: 'Something went wrong looking up the reorder queue.' });
  }
}

async function listPurchaseOrders(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  try {
    const result = await adminInventoryService.getPurchaseOrders({
      q: req.query.q || null,
      status: req.query.status || null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin purchase orders error', err);
    res.status(500).json({ error: 'Something went wrong looking up purchase orders.' });
  }
}

module.exports = { listStockLedger, listReorderQueue, listPurchaseOrders };
```

- [ ] **Step 2: Write `src/routes/adminInventoryRoutes.js`**

```javascript
const { Router } = require('express');
const { listStockLedger, listReorderQueue, listPurchaseOrders } = require('../controllers/adminInventoryController');

const router = Router();

router.get('/', listStockLedger);
router.get('/reorder', listReorderQueue);
router.get('/purchase-orders', listPurchaseOrders);

module.exports = router;
```

- [ ] **Step 3: Wire it into `src/app.js`**

Add the import beside the other admin route imports (near `const adminPromoCodeRoutes = require('./routes/adminPromoCodeRoutes');`):
```javascript
const adminInventoryRoutes = require('./routes/adminInventoryRoutes');
```
Add the mount beside the other admin mounts (near `app.use('/api/admin/promo-codes', requireAdminAuth, adminPromoCodeRoutes);`):
```javascript
app.use('/api/admin/inventory', requireAdminAuth, adminInventoryRoutes);
```

- [ ] **Step 4: Manually verify the endpoints**

Run: `curl -s -b <(curl -s -c - -X POST http://localhost:3000/api/admin/auth/... )` — instead, simpler: start the server (`npm run dev` or however this repo runs it), log into `/admin` in the browser first (cookie-based auth), then in the same browser tab visit `http://localhost:3000/api/admin/inventory`, `.../inventory/reorder`, `.../inventory/purchase-orders` directly.
Expected: each returns JSON matching the shapes in Task 2 (12 items on the ledger, 6 on the reorder queue, 4 purchase orders with `openCount: 2`).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/adminInventoryController.js src/routes/adminInventoryRoutes.js src/app.js
git commit -m "Wire up /api/admin/inventory endpoints"
```

---

### Task 4: Backend tests

**Files:**
- Create: `src/services/adminInventoryService.test.js` (or `.test.js` alongside however `adminProductService` is tested — check for an existing `src/services/adminProductService.test.js` or equivalent under a `test/`/`tests/` directory first and match that location/runner exactly)

**Interfaces:**
- Consumes: `adminInventoryService` (Task 2) against a real or test DB connection, following whatever pattern the existing admin service tests already use (check `adminProductService`'s own test file, if one exists, for the DB setup/teardown convention before writing this).

- [ ] **Step 1: Locate the existing backend test convention**

Run: `find . -not -path '*/node_modules/*' -not -path '*/worktrees/*' -iname '*adminProduct*test*' -o -not -path '*/node_modules/*' -not -path '*/worktrees/*' -iname '*adminOrder*test*' | grep -v frontend`
Read whatever test file(s) that finds in full before writing Step 2 — match its DB setup/teardown, its test runner (`vitest`/`jest`/`mocha`), and its assertion style exactly. If no backend service/controller tests exist at all in this repo (only frontend `frontend/src/**/*.test.jsx`), stop this task and report that back — don't invent a new backend test convention unprompted.

- [ ] **Step 2: Write tests covering, at minimum:**
  - `getStockLedger` returns exactly the 12 seeded items unfiltered; `status`/`available`/`days_of_cover` computed correctly for at least one `in_stock`, one `low_stock`, one `out_of_stock` fixture row; `category`/`location`/`supplier`/`status`/`q` filters each narrow the result set correctly; `stats.total_stock_value_cents`/`reorder_risk_count`/status counts match hand-computed values against the seed data in Task 1.
  - `getReorderQueue` returns exactly the 6 seeded at-or-below-reorder-point items; `deficit`/`suggested_po_qty` match hand-computed values; `urgency`/`supplier`/`q` filters narrow correctly.
  - `getPurchaseOrders` returns exactly the 4 seeded POs; `total_cents`/`item_count`/`total_units` match hand-computed sums from the seeded `purchase_order_items`; `openCount` is `2`; `status`/`q` filters narrow correctly.
  - Pagination: `page`/`pageSize` clamp the same way `adminProductService`'s existing tests verify (check that file for the exact assertions to mirror).

- [ ] **Step 3: Run the new tests**

Run: whatever command Step 1 revealed (e.g. `npm test -- adminInventoryService`)
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/adminInventoryService.test.js
git commit -m "Add tests for adminInventoryService"
```

---

### Task 5: New icons

**Files:**
- Modify: `frontend/src/components/icons.jsx` (append before `export const PRODUCT_ICONS`)

**Interfaces:**
- Produces: `BoxIcon`, `LedgerIcon`, `ClipboardIcon` — consumed by Task 6 (`AdminNav.jsx`) and Task 8/9's page headers if needed.

- [ ] **Step 1: Add the 3 icons**, matching every existing icon's exact convention (24×24 viewBox, `fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"`, spreading `{...props}`):

```jsx
// Inventory's own sidebar nav icon (AdminNav.jsx) - a closed shipping box,
// distinct from ShopIcon (Products, an open storefront glyph already in
// use one row above it).
export function BoxIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <line x1="12" y1="13" x2="12" y2="21" />
    </svg>
  );
}

// Stock Ledger's own sidebar nav icon - stacked horizontal rows, reading
// as a ledger/table rather than GridIcon's dashboard-tile grid.
export function LedgerIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

// Purchase Orders' own sidebar nav icon.
export function ClipboardIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4a1.5 1.5 0 0 1 3 0h0a1.5 1.5 0 0 1 3 0" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/icons.jsx
git commit -m "Add BoxIcon, LedgerIcon, ClipboardIcon"
```

---

### Task 6: AdminNav — expandable Inventory group, drop the sliding indicator

**Files:**
- Modify: `frontend/src/components/AdminNav.jsx` (full rewrite of the return body + state)
- Modify: `frontend/src/index.css` (remove `.admin-sidenav-indicator`, add group/chevron/subitem rules, add background to `.admin-sidenav-item.active`)
- Modify: `frontend/src/components/AdminNav.test.jsx`

**Interfaces:**
- Consumes: `BoxIcon`, `LedgerIcon`, `ClipboardIcon` (Task 5), existing `AlertTriangleIcon`, `ChevronDownIcon` (both already in `icons.jsx`).
- Produces: routes `/admin/inventory`, `/admin/inventory/reorder`, `/admin/inventory/purchase-orders` become reachable via the sidebar — Tasks 7–9's routes must exist in `App.jsx` for these links to resolve (this task's own test renders bare stub routes for them, same as the existing `AdminNav.test.jsx` does for `/admin/orders/:orderNumber`).

- [ ] **Step 1: Rewrite `frontend/src/components/AdminNav.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import {
  BrandMarkIcon,
  GridIcon,
  OrdersIcon,
  ShopIcon,
  PersonIcon,
  TicketIcon,
  LogoutIcon,
  PanelLeftIcon,
  BoxIcon,
  LedgerIcon,
  AlertTriangleIcon,
  ClipboardIcon,
  ChevronDownIcon,
} from './icons.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');
  const inventoryActive = pathname.startsWith('/admin/inventory');

  // Starts expanded if the sidebar mounts directly on an inventory route
  // (a page refresh, or a deep link). The effect below re-expands it on
  // every *navigation* onto an inventory route too, but deliberately
  // doesn't run on every render - so a manual collapse-while-still-on-
  // that-page click (toggled below) sticks instead of snapping back open.
  const [inventoryExpanded, setInventoryExpanded] = useState(inventoryActive);
  useEffect(() => {
    if (inventoryActive) setInventoryExpanded(true);
  }, [pathname, inventoryActive]);

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="admin-nav-root">
      <div className="admin-shell-body">
        <aside className={`admin-sidebar${collapsed ? ' admin-sidebar--collapsed' : ''}`}>
          <div className="admin-sidebar-clip">
            <button
              type="button"
              className="admin-sidebar-brand-button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              <span className="admin-sidebar-brand-mark" aria-hidden="true">
                <BrandMarkIcon />
              </span>
              <span className="admin-sidebar-brand-name">Admin</span>
            </button>

            <nav className="admin-sidenav" aria-label="Admin sections">
              <div className="admin-sidenav-list">
                <NavLink
                  to="/admin/dashboard"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <GridIcon /> <span className="admin-sidenav-label">Dashboard</span>
                </NavLink>
                <NavLink to="/admin" end className={`admin-sidenav-item${ordersActive ? ' active' : ''}`}>
                  <OrdersIcon /> <span className="admin-sidenav-label">Orders</span>
                </NavLink>
                <NavLink
                  to="/admin/products"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <ShopIcon /> <span className="admin-sidenav-label">Products</span>
                </NavLink>

                <button
                  type="button"
                  className={`admin-sidenav-item admin-sidenav-group${inventoryActive ? ' active' : ''}`}
                  onClick={() => setInventoryExpanded((e) => !e)}
                  aria-expanded={inventoryExpanded}
                >
                  <BoxIcon /> <span className="admin-sidenav-label">Inventory</span>
                  <ChevronDownIcon className="admin-sidenav-chevron" aria-hidden="true" />
                </button>
                {inventoryExpanded && (
                  <div className="admin-sidenav-subgroup">
                    <NavLink
                      to="/admin/inventory"
                      end
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <LedgerIcon /> <span className="admin-sidenav-label">Stock Ledger</span>
                    </NavLink>
                    <NavLink
                      to="/admin/inventory/reorder"
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <AlertTriangleIcon /> <span className="admin-sidenav-label">Reorder Queue</span>
                    </NavLink>
                    <NavLink
                      to="/admin/inventory/purchase-orders"
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <ClipboardIcon /> <span className="admin-sidenav-label">Purchase Orders</span>
                    </NavLink>
                  </div>
                )}

                <NavLink
                  to="/admin/customers"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <PersonIcon /> <span className="admin-sidenav-label">Customers</span>
                </NavLink>
                <NavLink
                  to="/admin/promo-codes"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <TicketIcon /> <span className="admin-sidenav-label">Promo Codes</span>
                </NavLink>
              </div>
            </nav>
          </div>

          <div className="admin-account-row">
            <span className="admin-account-avatar" aria-hidden="true">{initial}</span>
            <span className="admin-account-email">{email}</span>
            <button type="button" className="admin-account-logout" onClick={logout} aria-label="Log out">
              <LogoutIcon />
            </button>
          </div>
        </aside>

        <div className="admin-nav-content">
          {collapsed && (
            <button
              type="button"
              className="sidebar-toggle admin-sidebar-reopen"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeftIcon open={false} />
            </button>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the CSS in `frontend/src/index.css`**

Remove the `.admin-sidenav-indicator` rule entirely (it's dead now - nothing renders that class anymore). Change `.admin-sidenav-item.active` to carry its own background (the indicator used to supply this):
```css
.admin-sidenav-item.active {
  background: rgba(255, 255, 255, 0.07);
  color: #fafafa;
}
```
Add, directly after the `.admin-sidenav-item` rules:
```css
.admin-sidenav-group {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.admin-sidenav-chevron {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform var(--duration-base) var(--ease-out-bezier);
}

.admin-sidenav-group[aria-expanded="true"] .admin-sidenav-chevron {
  transform: rotate(180deg);
}

.admin-sidenav-subgroup {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0 0.5rem;
  padding-left: 0.6rem;
  border-left: 1px solid #434343;
}

.admin-sidenav-subitem {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 32px;
  padding: 0 0.7rem;
  border-radius: var(--radius-md);
  color: #a1a1a1;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.admin-sidenav-subitem svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.admin-sidenav-subitem:hover {
  color: #fafafa;
}

.admin-sidenav-subitem.active {
  background: rgba(255, 255, 255, 0.07);
  color: #fafafa;
}
```

- [ ] **Step 3: Update `frontend/src/components/AdminNav.test.jsx`**

Add stub routes for the 3 new paths inside `renderNav`'s `<Routes>` (alongside the existing `/admin/orders/:orderNumber` stub):
```jsx
<Route path="/admin/inventory" element={<p>Stock ledger page</p>} />
<Route path="/admin/inventory/reorder" element={<p>Reorder queue page</p>} />
<Route path="/admin/inventory/purchase-orders" element={<p>Purchase orders page</p>} />
```
Add new tests:
```jsx
it('shows the Inventory group collapsed by default off an inventory route', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.queryByRole('link', { name: /stock ledger/i })).not.toBeInTheDocument();
});

it('auto-expands the Inventory group when mounted on an inventory sub-route', async () => {
  renderNav('/admin/inventory/reorder');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /reorder queue/i })).toBeInTheDocument();
});

it('marks the Reorder Queue sub-link active and its siblings inactive', async () => {
  renderNav('/admin/inventory/reorder');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /reorder queue/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /stock ledger/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /purchase orders/i })).not.toHaveClass('active');
});

it('expands and collapses the Inventory group on click', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: /inventory/i }));
  expect(screen.getByRole('link', { name: /stock ledger/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /inventory/i }));
  expect(screen.queryByRole('link', { name: /stock ledger/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: all pass (original 8 + 4 new = 12).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AdminNav.jsx frontend/src/components/AdminNav.test.jsx frontend/src/index.css
git commit -m "Add expandable Inventory nav group, drop the sliding sidenav indicator"
```

---

### Task 7: `AdminStockLedgerPage.jsx`

**Files:**
- Create: `frontend/src/pages/AdminStockLedgerPage.jsx`
- Create: `frontend/src/pages/AdminStockLedgerPage.test.jsx`
- Modify: `frontend/src/index.css` (new `admin-inventory-*` block)
- Modify: `frontend/src/App.jsx` (lazy import + route)

**Interfaces:**
- Consumes: `GET /api/admin/inventory` (Task 3), `formatCents` (`frontend/src/utils/pricing.js`), `ProductImage` (`frontend/src/components/ProductImage.jsx`).
- Produces: route `path="inventory"` inside the existing `<Route element={<AdminNav />}>` block in `App.jsx`.

- [ ] **Step 1: Add the CSS block to `frontend/src/index.css`**

Duplicate the entire `.admin-products-page` block (`frontend/src/index.css` lines 8546–8888, from `.admin-products-page {` through the `.admin-products-page input:focus-visible` rule) with every `admin-products` replaced by `admin-inventory`, via:
```bash
cd frontend
awk '/^\.admin-products-page \{/,/^\.admin-products-page input:focus-visible \{\n  outline: 2px solid #fafafa;\n  outline-offset: 2px;\n\}/' src/index.css
```
That awk one-liner won't cleanly bound a multi-line closing rule - instead do it directly: open `src/index.css`, select the exact line range 8546–8888 (`.admin-products-page {` through the closing `}` of `.admin-products-page input:focus-visible`), copy it, paste immediately after, and in the pasted copy replace every occurrence of `admin-products` with `admin-inventory` (find-and-replace scoped to just the pasted block). Then append these additional rules (stat cards + status bar, fixed-dark palette to match the rest of this page, distinct from `AdminDashboardPage`'s theme-aware stat cards):

```css
.admin-inventory-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  margin-bottom: 1.25rem;
}

.admin-inventory-stat-card {
  padding: var(--space-3);
  border: 1px solid #434343;
  border-radius: 10px;
  background: #171717;
}

.admin-inventory-stat-label {
  margin: 0 0 0.3rem;
  font-size: 0.8rem;
  color: #a1a1a1;
}

.admin-inventory-stat-value {
  margin: 0 0 0.2rem;
  font-size: 1.4rem;
  font-weight: 700;
  color: #fafafa;
}

.admin-inventory-stat-sub {
  margin: 0;
  font-size: 0.76rem;
  color: #6b6b6b;
}

.admin-inventory-health {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  flex-wrap: wrap;
  padding: 1.1rem 1.25rem;
  border: 1px solid #434343;
  border-radius: 10px;
  background: #171717;
  margin-bottom: 1.25rem;
}

.admin-inventory-health-value {
  margin: 0.3rem 0 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: #fafafa;
}

.admin-inventory-health-bar-wrap {
  flex: 1;
  min-width: 220px;
}

.admin-inventory-health-bar {
  display: flex;
  height: 8px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: #0a0a0a;
  margin-bottom: 0.5rem;
}

.admin-inventory-health-bar-segment.in-stock { background: #34d399; }
.admin-inventory-health-bar-segment.low-stock { background: #fbbf24; }
.admin-inventory-health-bar-segment.out-of-stock { background: #fb7185; }

.admin-inventory-health-legend {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: #a1a1a1;
}

.admin-inventory-health-legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 0.35rem;
}

.admin-inventory-health-legend-dot.in-stock { background: #34d399; }
.admin-inventory-health-legend-dot.low-stock { background: #fbbf24; }
.admin-inventory-health-legend-dot.out-of-stock { background: #fb7185; }
```

- [ ] **Step 2: Write `frontend/src/pages/AdminStockLedgerPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

const STATUS_LABELS = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };

function buildQuery({ q, category, location, supplier, status, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (location) params.set('location', location);
  if (supplier) params.set('supplier', supplier);
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

export function AdminStockLedgerPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory?${buildQuery({ q, category, location, supplier, status, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up inventory.');
        }
        return res.json();
      })
      .then((result) => {
        if (cancelled || !result) return;
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, category, location, supplier, status, page, pageSize]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const stats = data?.stats;

  function resetToPage1(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div className="admin-inventory-page">
      <div className="admin-products-head">
        <div className="admin-products-head-left">
          <h1>Stock Ledger</h1>
          <span className="admin-products-count">{total} SKUs</span>
        </div>
      </div>

      {stats && (
        <>
          <div className="admin-inventory-stats">
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Days of Cover</p>
              <p className="admin-inventory-stat-value">
                {stats.days_of_cover === null ? '—' : `${stats.days_of_cover.toFixed(1)}d`}
              </p>
              <p className="admin-inventory-stat-sub">{stats.avg_lead_time_days.toFixed(1)}d avg lead time</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Reorder Risk</p>
              <p className="admin-inventory-stat-value">{stats.reorder_risk_count}</p>
              <p className="admin-inventory-stat-sub">of {stats.total_skus} SKUs</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Units On Hand</p>
              <p className="admin-inventory-stat-value">{stats.units_on_hand.toLocaleString()}</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Allocated</p>
              <p className="admin-inventory-stat-value">{stats.allocated.toLocaleString()}</p>
              <p className="admin-inventory-stat-sub">{stats.total_skus} SKUs tracked</p>
            </div>
          </div>

          <div className="admin-inventory-health">
            <div>
              <p className="admin-inventory-stat-label">Total Stock Value</p>
              <p className="admin-inventory-health-value">{formatCents(stats.total_stock_value_cents)}</p>
            </div>
            <div className="admin-inventory-health-bar-wrap">
              <div className="admin-inventory-health-bar">
                {stats.in_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment in-stock"
                    style={{ width: `${(stats.in_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
                {stats.low_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment low-stock"
                    style={{ width: `${(stats.low_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
                {stats.out_of_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment out-of-stock"
                    style={{ width: `${(stats.out_of_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
              </div>
              <div className="admin-inventory-health-legend">
                <span><span className="admin-inventory-health-legend-dot in-stock" />In stock: {stats.in_stock_count}</span>
                <span><span className="admin-inventory-health-legend-dot low-stock" />Low stock: {stats.low_stock_count}</span>
                <span><span className="admin-inventory-health-legend-dot out-of-stock" />Out of stock: {stats.out_of_stock_count}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="admin-products-toolbar">
        <div className="admin-products-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-inventory-search" className="sr-only">Search SKUs by product or SKU code</label>
          <input
            id="admin-inventory-search"
            type="text"
            placeholder="Search SKUs..."
            value={q}
            onChange={resetToPage1(setQ)}
          />
        </div>

        <label htmlFor="admin-inventory-category" className="sr-only">Filter by category</label>
        <select id="admin-inventory-category" value={category} onChange={resetToPage1(setCategory)}>
          <option value="">All categories</option>
          {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label htmlFor="admin-inventory-location" className="sr-only">Filter by location</label>
        <select id="admin-inventory-location" value={location} onChange={resetToPage1(setLocation)}>
          <option value="">All locations</option>
          {(data?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <label htmlFor="admin-inventory-supplier" className="sr-only">Filter by supplier</label>
        <select id="admin-inventory-supplier" value={supplier} onChange={resetToPage1(setSupplier)}>
          <option value="">All suppliers</option>
          {(data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label htmlFor="admin-inventory-status" className="sr-only">Filter by status</label>
        <select id="admin-inventory-status" value={status} onChange={resetToPage1(setStatus)}>
          <option value="">All statuses</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-products-table-card">
          <table className="admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Location</th>
                <th className="admin-products-num">On hand</th>
                <th className="admin-products-num">Allocated</th>
                <th className="admin-products-num">Available</th>
                <th className="admin-products-num">Reorder point</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="admin-products-product-cell">
                      <ProductImage icon={item.icon} size="sm" />
                      <div>
                        <span className="admin-products-name">{item.product_name}</span>
                        <span className="admin-products-sku">{item.sku_code}</span>
                      </div>
                    </div>
                  </td>
                  <td>{item.location_name}</td>
                  <td className="admin-products-num">{item.on_hand}</td>
                  <td className="admin-products-num">{item.allocated}</td>
                  <td className="admin-products-num">{item.available}</td>
                  <td className="admin-products-num">{item.reorder_point}</td>
                  <td>
                    <span className={`admin-products-stock-badge ${item.status.replace(/_/g, '-')}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && !error && (
                <tr className="admin-products-empty-row">
                  <td colSpan={7}>No SKUs match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-products-pager">
          <div className="admin-products-pager-left">
            <label htmlFor="admin-inventory-page-size">Rows per page</label>
            <select
              id="admin-inventory-page-size"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>
          <div className="admin-products-pager-right">
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">&lsaquo;</button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button key={p} type="button" className={`admin-products-page-btn${p === page ? ' current' : ''}`} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ) : (
                <span key={p} className="admin-products-page-ellipsis" aria-hidden="true">&hellip;</span>
              )
            )}
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount} aria-label="Next page">&rsaquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the route in `frontend/src/App.jsx`**

Add the lazy import beside the other admin page imports:
```javascript
const AdminStockLedgerPage = lazy(() =>
  import('./pages/AdminStockLedgerPage.jsx').then((m) => ({ default: m.AdminStockLedgerPage }))
);
```
Add the route inside `<Route element={<AdminNav />}>`, after the `products` routes:
```jsx
<Route path="inventory" element={<AdminStockLedgerPage />} />
```

- [ ] **Step 4: Write `frontend/src/pages/AdminStockLedgerPage.test.jsx`**, following `AdminProductsPage.test.jsx`'s exact structure:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminStockLedgerPage } from './AdminStockLedgerPage.jsx';

const RESPONSE = {
  items: [
    { id: 1, product_slug: 'headphones', product_name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', icon: 'headphones', price_cents: 14999, location_id: 1, location_name: 'Main Warehouse', sku_code: 'AUD-HP-001-MW', on_hand: 42, allocated: 4, available: 38, reorder_point: 20, avg_daily_units_sold: 1.8, days_of_cover: 23.3, status: 'in_stock', supplier_id: 1, supplier_name: 'Atlas Wholesale', lead_time_days: 16 },
    { id: 2, product_slug: 'headphones', product_name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', icon: 'headphones', price_cents: 14999, location_id: 2, location_name: 'East DC', sku_code: 'AUD-HP-001-EDC', on_hand: 6, allocated: 1, available: 5, reorder_point: 15, avg_daily_units_sold: 1.2, days_of_cover: 5, status: 'low_stock', supplier_id: 2, supplier_name: 'Cedar Logistics', lead_time_days: 12 },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  categories: ['Audio'],
  locations: [{ id: 1, name: 'Main Warehouse' }, { id: 2, name: 'East DC' }],
  suppliers: [{ id: 1, name: 'Atlas Wholesale' }, { id: 2, name: 'Cedar Logistics' }],
  stats: {
    days_of_cover: 15.2, avg_lead_time_days: 14, reorder_risk_count: 1, total_skus: 2,
    units_on_hand: 48, allocated: 5, total_stock_value_cents: 719952,
    out_of_stock_count: 0, low_stock_count: 1, in_stock_count: 1,
  },
};

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminStockLedgerPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory')) {
      return Promise.resolve({ ok: true, json: async () => RESPONSE });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders stat cards and table rows from the API', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('AUD-HP-001-MW')).toBeInTheDocument();
  expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
  expect(screen.getByText('East DC')).toBeInTheDocument();
  expect(screen.getByText('15.2d')).toBeInTheDocument();
});

it('shows In stock and Low stock badges from the row status', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-MW');
  expect(screen.getByText('In stock')).toBeInTheDocument();
  expect(screen.getByText('Low stock')).toBeInTheDocument();
});

it('re-fetches page 1 with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-MW');
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'low_stock' } });
  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('status=low_stock') && String(url).includes('page=1'));
    expect(called).toBe(true);
  });
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (String(url).startsWith('/api/admin/inventory')) return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });
  renderPage();
  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/pages/AdminStockLedgerPage.test.jsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminStockLedgerPage.jsx frontend/src/pages/AdminStockLedgerPage.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add Stock Ledger admin page"
```

---

### Task 8: `AdminReorderQueuePage.jsx`

**Files:**
- Create: `frontend/src/pages/AdminReorderQueuePage.jsx`
- Create: `frontend/src/pages/AdminReorderQueuePage.test.jsx`
- Modify: `frontend/src/index.css` (new `admin-reorder-*` block — same duplication approach as Task 7 Step 1, but only the stat-card/health rules need genuinely new selectors; the table/toolbar/pager can reuse the `admin-products-*`/`admin-inventory-*` classes already defined, exactly as Task 7's own JSX does)
- Modify: `frontend/src/App.jsx` (lazy import + route)

**Interfaces:**
- Consumes: `GET /api/admin/inventory/reorder` (Task 3).
- Produces: route `path="inventory/reorder"`.

- [ ] **Step 1: Add 2 new stat cards + urgency bar CSS to `frontend/src/index.css`**, reusing `.admin-inventory-stat-card`/`.admin-inventory-health-*` from Task 7 as-is (no new classes needed — the urgency bar has only 2 segments, both colors already defined: `.admin-inventory-health-bar-segment.low-stock`/`.out-of-stock`).

- [ ] **Step 2: Write `frontend/src/pages/AdminReorderQueuePage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

function buildQuery({ q, urgency, supplier, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (urgency) params.set('urgency', urgency);
  if (supplier) params.set('supplier', supplier);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

export function AdminReorderQueuePage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState('');
  const [supplier, setSupplier] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory/reorder?${buildQuery({ q, urgency, supplier, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up the reorder queue.');
        }
        return res.json();
      })
      .then((result) => {
        if (cancelled || !result) return;
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, urgency, supplier, page, pageSize]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const stats = data?.stats;

  function resetToPage1(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div className="admin-reorder-page">
      <div className="admin-products-head">
        <div className="admin-products-head-left">
          <h1>Reorder Queue</h1>
          <span className="admin-products-count">{total} SKUs</span>
        </div>
      </div>

      {stats && (
        <>
          <div className="admin-inventory-stats">
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">At-risk inventory value</p>
              <p className="admin-inventory-stat-value">{formatCents(stats.at_risk_value_cents)}</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">SKUs needing action</p>
              <p className="admin-inventory-stat-value">{stats.needing_action_count}</p>
            </div>
          </div>

          <div className="admin-inventory-health">
            <div className="admin-inventory-health-bar-wrap">
              <div className="admin-inventory-health-bar">
                {stats.low_stock_count > 0 && (
                  <span className="admin-inventory-health-bar-segment low-stock" style={{ width: `${(stats.low_stock_count / stats.needing_action_count) * 100}%` }} />
                )}
                {stats.out_of_stock_count > 0 && (
                  <span className="admin-inventory-health-bar-segment out-of-stock" style={{ width: `${(stats.out_of_stock_count / stats.needing_action_count) * 100}%` }} />
                )}
              </div>
              <div className="admin-inventory-health-legend">
                <span><span className="admin-inventory-health-legend-dot low-stock" />Low stock: {stats.low_stock_count}</span>
                <span><span className="admin-inventory-health-legend-dot out-of-stock" />Out of stock: {stats.out_of_stock_count}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="admin-products-toolbar">
        <div className="admin-products-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-reorder-search" className="sr-only">Search SKU or product</label>
          <input id="admin-reorder-search" type="text" placeholder="Search SKU or product..." value={q} onChange={resetToPage1(setQ)} />
        </div>

        <label htmlFor="admin-reorder-urgency" className="sr-only">Filter by urgency</label>
        <select id="admin-reorder-urgency" value={urgency} onChange={resetToPage1(setUrgency)}>
          <option value="">All urgency</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>

        <label htmlFor="admin-reorder-supplier" className="sr-only">Filter by supplier</label>
        <select id="admin-reorder-supplier" value={supplier} onChange={resetToPage1(setSupplier)}>
          <option value="">All suppliers</option>
          {(data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-products-table-card">
          <table className="admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="admin-products-num">Available</th>
                <th className="admin-products-num">Reorder point</th>
                <th className="admin-products-num">Deficit</th>
                <th className="admin-products-num">Suggested PO</th>
                <th>Supplier</th>
                <th className="admin-products-num">Days of cover</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="admin-products-product-cell">
                      <ProductImage icon={item.icon} size="sm" />
                      <div>
                        <span className="admin-products-name">{item.product_name}</span>
                        <span className="admin-products-sku">{item.sku_code}</span>
                      </div>
                    </div>
                  </td>
                  <td className="admin-products-num">{item.available}</td>
                  <td className="admin-products-num">{item.reorder_point}</td>
                  <td className="admin-products-num">{item.deficit}</td>
                  <td className="admin-products-num">{item.suggested_po_qty}</td>
                  <td>
                    {item.supplier_name ?? '—'}
                    {item.lead_time_days != null && <span className="admin-products-sku"> {item.lead_time_days}d lead</span>}
                  </td>
                  <td className="admin-products-num">{item.days_of_cover === null ? '—' : `${Math.round(item.days_of_cover)}d`}</td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && !error && (
                <tr className="admin-products-empty-row">
                  <td colSpan={7}>No SKUs are below their reorder point.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-products-pager">
          <div className="admin-products-pager-left">
            <label htmlFor="admin-reorder-page-size">Rows per page</label>
            <select id="admin-reorder-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>
          <div className="admin-products-pager-right">
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">&lsaquo;</button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button key={p} type="button" className={`admin-products-page-btn${p === page ? ' current' : ''}`} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ) : (
                <span key={p} className="admin-products-page-ellipsis" aria-hidden="true">&hellip;</span>
              )
            )}
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount} aria-label="Next page">&rsaquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the route in `frontend/src/App.jsx`**, same pattern as Task 7 Step 3:
```javascript
const AdminReorderQueuePage = lazy(() =>
  import('./pages/AdminReorderQueuePage.jsx').then((m) => ({ default: m.AdminReorderQueuePage }))
);
```
```jsx
<Route path="inventory/reorder" element={<AdminReorderQueuePage />} />
```

- [ ] **Step 4: Write `frontend/src/pages/AdminReorderQueuePage.test.jsx`**, mirroring Task 7 Step 4's structure against `/api/admin/inventory/reorder`, with a fixture response shaped like `getReorderQueue`'s return value (`items` with `deficit`/`suggested_po_qty`, `stats: { at_risk_value_cents, needing_action_count, out_of_stock_count, low_stock_count }`). Cover: rows render with deficit/suggested-PO/supplier/lead-time, the urgency filter re-fetches page 1 with `urgency=...`, empty state, 401 → logout.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/pages/AdminReorderQueuePage.test.jsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminReorderQueuePage.jsx frontend/src/pages/AdminReorderQueuePage.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add Reorder Queue admin page"
```

---

### Task 9: `AdminPurchaseOrdersPage.jsx`

**Files:**
- Create: `frontend/src/pages/AdminPurchaseOrdersPage.jsx`
- Create: `frontend/src/pages/AdminPurchaseOrdersPage.test.jsx`
- Modify: `frontend/src/index.css` (new `.admin-po-status-badge` rules)
- Modify: `frontend/src/App.jsx` (lazy import + route)

**Interfaces:**
- Consumes: `GET /api/admin/inventory/purchase-orders` (Task 3), `formatCents`.
- Produces: route `path="inventory/purchase-orders"`.

- [ ] **Step 1: Add status badge CSS to `frontend/src/index.css`**, following the exact color palette already used by `.admin-products-stock-badge`:
```css
.admin-po-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.28rem 0.6rem;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.admin-po-status-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.admin-po-status-badge.draft { background: rgba(69, 26, 3, 0.6); color: #fbbf24; }
.admin-po-status-badge.received { background: rgba(6, 78, 59, 0.6); color: #34d399; }
.admin-po-status-badge.cancelled { background: rgba(76, 5, 25, 0.6); color: #fb7185; }
```

- [ ] **Step 2: Write `frontend/src/pages/AdminPurchaseOrdersPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [8, 25, 50];
const DEFAULT_PAGE_SIZE = 8;

const STATUS_LABELS = { draft: 'Draft', received: 'Received', cancelled: 'Cancelled' };

function buildQuery({ q, status, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AdminPurchaseOrdersPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory/purchase-orders?${buildQuery({ q, status, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up purchase orders.');
        }
        return res.json();
      })
      .then((result) => {
        if (cancelled || !result) return;
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, status, page, pageSize]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function resetToPage1(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div className="admin-po-page">
      <div className="admin-products-head">
        <div className="admin-products-head-left">
          <h1>Purchase Orders</h1>
          {data && <span className="admin-products-count">{data.openCount} open</span>}
        </div>
      </div>

      <div className="admin-products-toolbar">
        <div className="admin-products-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-po-search" className="sr-only">Search PO or supplier</label>
          <input id="admin-po-search" type="text" placeholder="Search PO or supplier..." value={q} onChange={resetToPage1(setQ)} />
        </div>

        <label htmlFor="admin-po-status" className="sr-only">Filter by status</label>
        <select id="admin-po-status" value={status} onChange={resetToPage1(setStatus)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-products-table-card">
          <table className="admin-products-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th className="admin-products-num">Total</th>
                <th>Receive into</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(data?.purchaseOrders ?? []).map((po) => (
                <tr key={po.id}>
                  <td>
                    <span className="admin-products-name">{po.po_number}</span>
                    <span className="admin-products-sku">{po.supplier_name}</span>
                  </td>
                  <td>{po.item_count} SKU{po.item_count === 1 ? '' : 's'} · {po.total_units} units</td>
                  <td className="admin-products-num admin-products-price-current">{formatCents(po.total_cents)}</td>
                  <td>{po.receive_into_location}</td>
                  <td>
                    <span className={`admin-po-status-badge ${po.status}`}>{STATUS_LABELS[po.status]}</span>
                  </td>
                  <td>
                    {po.status === 'received' ? formatDate(po.received_date) : formatDate(po.expected_date)}
                    <span className="admin-products-sku"> {po.status === 'received' ? 'Received' : 'Expected'}</span>
                  </td>
                </tr>
              ))}
              {(data?.purchaseOrders ?? []).length === 0 && !error && (
                <tr className="admin-products-empty-row">
                  <td colSpan={6}>No purchase orders match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-products-pager">
          <div className="admin-products-pager-left">
            <label htmlFor="admin-po-page-size">Rows per page</label>
            <select id="admin-po-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>
          <div className="admin-products-pager-right">
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">&lsaquo;</button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button key={p} type="button" className={`admin-products-page-btn${p === page ? ' current' : ''}`} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ) : (
                <span key={p} className="admin-products-page-ellipsis" aria-hidden="true">&hellip;</span>
              )
            )}
            <button type="button" className="admin-products-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount} aria-label="Next page">&rsaquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the route in `frontend/src/App.jsx`**:
```javascript
const AdminPurchaseOrdersPage = lazy(() =>
  import('./pages/AdminPurchaseOrdersPage.jsx').then((m) => ({ default: m.AdminPurchaseOrdersPage }))
);
```
```jsx
<Route path="inventory/purchase-orders" element={<AdminPurchaseOrdersPage />} />
```

- [ ] **Step 4: Write `frontend/src/pages/AdminPurchaseOrdersPage.test.jsx`**, mirroring Task 7 Step 4 against `/api/admin/inventory/purchase-orders`, fixture shaped like `getPurchaseOrders`'s return (`purchaseOrders` with `item_count`/`total_units`/`total_cents`/`status`, `openCount`). Cover: rows render (PO number, supplier, items summary, total, receive-into, status badge, date), the "N open" badge shows `openCount`, status filter re-fetches page 1 with `status=...`, empty state, 401 → logout.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/pages/AdminPurchaseOrdersPage.test.jsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminPurchaseOrdersPage.jsx frontend/src/pages/AdminPurchaseOrdersPage.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add Purchase Orders admin page"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: every test passes, including all pre-existing ones (no regressions from the `AdminNav.jsx` rewrite or new CSS).

- [ ] **Step 2: Run the backend test suite**

Run: whatever command Task 4 Step 1 identified for the whole backend suite.
Expected: all pass.

- [ ] **Step 3: Manual browser check**

Start the dev server, sign into `/admin`, and confirm: the sidebar shows an "Inventory" group between Products and Customers that expands/collapses on click and auto-expands when navigating to any of its 3 sub-pages; Stock Ledger shows 12 SKUs with working search/category/location/supplier/status filters and correct stat cards; Reorder Queue shows 6 SKUs with working filters; Purchase Orders shows 4 POs with "2 open" and working search/status filters; sidebar collapse/reopen and logout still work (regression check on Task 6's rewrite).

- [ ] **Step 4: Commit** (only if Steps 1–3 required fixes not already committed in their originating task)
