# Admin Inventory (Stock Ledger, Reorder Queue, Purchase Orders) — design

## Goal
Add an "Inventory" section to the admin app shell with three real, DB-backed, read+filter pages — Stock Ledger, Reorder Queue, Purchase Orders — visually modeled on the reference screenshots (an unrelated demo app, `surge-commerce.reui.io`), but built on this app's own real product catalog rather than replicating that app's fabricated 163-SKU data.

## Why this app has no inventory data today
`products.stock_quantity` is a single admin-set integer per product, never decremented by checkout (orders aren't FK'd to products at all — matched by `product_name` string, see `adminOrderService.js`'s own comment on this). There are only 6 real seeded products (`headphones`, `keyboard`, `chair`, `monitor`, `cable`, `cloud-shift-runner`). This feature introduces genuinely new concepts (locations, suppliers, per-location stock, purchase orders) as real tables with real seeded data — not a UI mockup — but at the same honesty level the rest of admin already uses: seeded/admin-set numbers, not live sales-derived ones.

## Scope
- **In**: 3 new DB tables + 1 join table, one new admin API resource (`/api/admin/inventory`), 3 new admin pages, sidebar nav updates (expandable "Inventory" group), CSS.
- **Out** (per explicit decision): row-level "..." actions, Export, creating/editing/receiving purchase orders, separate CRUD pages for locations/suppliers, live sales-velocity computation (no order-line-item history exists to compute it from).

## Data model

```sql
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
```

Seed data (one migration, following `1786768164997_backfill-products.sql`'s convention):
- Locations: Main Warehouse, East DC, Store-Brooklyn
- Suppliers: Atlas Wholesale (16d lead), Cedar Logistics (12d lead), Harbor Supply Co. (20d lead)
- Inventory items: each of the 6 products gets 2 rows (2 different locations each — not all 3, so the ledger shows realistic partial coverage), `sku_code` derived from the product's existing `sku` + a location suffix (e.g. `AUD-HP-001-MW`, `AUD-HP-001-EDC`). Values hand-picked so the derived stat cards and both queue/status distributions are non-trivial (some in-stock, some low-stock, at least 2 out-of-stock/at-or-below-reorder-point rows to populate the Reorder Queue).
- 4–5 purchase orders across the 3 statuses, 1–2 line items each, referencing seeded inventory items.

Derived (computed in SQL, never stored):
- `available` = `on_hand - allocated`
- `status` = `'out_of_stock'` if `on_hand = 0`, else `'low_stock'` if `available <= reorder_point`, else `'in_stock'`
- `days_of_cover` = `on_hand / NULLIF(avg_daily_units_sold, 0)` (NULL/∞ guarded, rendered as "—" when unavailable)
- Reorder Queue row set = `inventory_items` where `available <= reorder_point`
- `deficit` = `reorder_point - available` (floor 0)
- `suggested_po_qty` = `ROUND((reorder_point * 2 - available) / 10.0) * 10`, floor 10
- Purchase order `total_cents` = `SUM(quantity * unit_cost_cents)` over its items, `item_count` = `COUNT(*)`, `total_units` = `SUM(quantity)`

## Backend API

New files following the exact `adminProductController.js`/`Service.js`/`Routes.js` split, registered as `app.use('/api/admin/inventory', requireAdminAuth, adminInventoryRoutes)` in `src/app.js` (after the promo-codes line).

- `GET /api/admin/inventory` — stock ledger. Query params: `q` (matches product name or sku_code), `category`, `location` (location id), `supplier` (supplier id), `status` (`in_stock`/`low_stock`/`out_of_stock`), `page`, `pageSize` (same `parsePositiveInt`/`DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` pattern as `adminProductService`). Response: `{ items: [...], total, page, pageSize, stats: { days_of_cover, reorder_risk_count, units_on_hand, allocated, total_stock_value_cents, status_counts: { in_stock, low_stock, out_of_stock } } }`. `stats` are computed over the *unfiltered* full set (matching how the Stock Ledger's cards in the reference don't change when the table is filtered).
- `GET /api/admin/inventory/reorder` — same filter/pagination shape (minus `status`, replaced by `urgency`: `low_stock`/`out_of_stock`), pre-filtered to `available <= reorder_point`. Response: `{ items: [...], total, page, pageSize, stats: { at_risk_value_cents, needing_action_count, low_stock_count, out_of_stock_count } }`.
- `GET /api/admin/inventory/purchase-orders` — query params `q` (po_number or supplier name), `status`, `page`, `pageSize`. Response: `{ purchaseOrders: [...], total, page, pageSize, openCount }` (`openCount` = count where `status = 'draft'`).

All three require `requireAdminAuth` (inherited from the route-group mount, same as every other `/api/admin/*` resource) and return `401` via the same pattern on auth failure the frontend already handles (`AdminDashboardPage.jsx`'s `if (res.status === 401) logout()`).

## Frontend

**Routes** (`App.jsx`, inside the existing `<Route element={<AdminNav />}>` block):
```
<Route path="inventory" element={<AdminStockLedgerPage />} />
<Route path="inventory/reorder" element={<AdminReorderQueuePage />} />
<Route path="inventory/purchase-orders" element={<AdminPurchaseOrdersPage />} />
```
Each lazy-imported like the existing admin pages.

**AdminStockLedgerPage.jsx** (`admin-inventory-*` CSS prefix):
- Header: "Stock Ledger" + SKU count badge (matches `admin-orders-count`'s "44 orders" pattern)
- 4 stat cards (`admin-dashboard-stat-card`-style, reused as-is): Days of Cover, Reorder Risk, Units On Hand, Allocated
- Stock-health panel: Total Stock Value (`SUM(on_hand * price_cents)` across all items) + a 3-segment status bar with counts (in stock / low stock / out of stock)
- Toolbar: search input, Category select, Location select, Supplier select, Status select
- Table: Product (image + name + sku_code), Location, On hand, Allocated, Available, Reorder point, Status badge
- Pager: same rows-per-page + numbered pages pattern as `AdminProductsPage`

**AdminReorderQueuePage.jsx** (`admin-reorder-*` CSS prefix):
- Header: "Reorder Queue" + SKU count badge
- 2 stat cards + urgency bar (low stock / out of stock counts)
- Toolbar: search, urgency select, supplier select
- Table: Product, Available, Reorder point, Deficit, Suggested PO qty, Supplier (+ lead time), Days of cover
- Pager

**AdminPurchaseOrdersPage.jsx** (`admin-po-*` CSS prefix):
- Header: "Purchase Orders" + "N open" badge
- Toolbar: search, status select
- Table: Order (po_number), Supplier, Items ("N SKUs · M units"), Total, Receive into, Status badge, Date (received_date if received, else expected_date, labeled accordingly like the reference's "Expected"/"Received" sublabel)
- Pager

**Status badges**: reuse the existing `.order-history-badge` base class (already theme-neutral-capable) with new admin-scoped color overrides, following the exact doubled-selector pattern already used for orders (`.admin-orders-page .order-history-badge.status-delivered.status-delivered` etc.) — add `.admin-inventory-page .order-history-badge.status-in-stock`, `.status-low-stock`, `.status-out-of-stock`, and `.admin-po-page .order-history-badge.status-draft`, `.status-received`, `.status-cancelled`.

## Sidebar navigation change

`AdminNav.jsx` gets a new expandable "Inventory" parent item inserted between Products and Customers, containing the 3 sub-links. This requires dropping the current sliding-pill `.admin-sidenav-indicator` mechanism (its fixed-pixel `translateY` math assumes a constant row count/height, which breaks once a section can expand and push later rows down) in favor of a plain per-row active background on both top-level items and sub-items — closer to the reference screenshots anyway, which don't show a sliding pill.

- `Inventory` row: icon (`BoxIcon`) + label + chevron (`ChevronDownIcon`, rotated when expanded — reuse existing icon, no new one needed). Clicking toggles local `inventoryExpanded` state.
- Auto-expanded on mount when `pathname.startsWith('/admin/inventory')`.
- Sub-items (`admin-sidenav-subitem`): Stock Ledger (`LedgerIcon`, new), Reorder Queue (`AlertTriangleIcon`, existing), Purchase Orders (`ClipboardIcon`, new) — indented, same active-background treatment as top-level items, linking to `/admin/inventory`, `/admin/inventory/reorder`, `/admin/inventory/purchase-orders` respectively. `/admin/inventory` sub-link uses `end` so it isn't marked active on its own child routes (there are none here, but matches the existing Orders `end` precedent for consistency).
- `BoxIcon`/`LedgerIcon`/`ClipboardIcon` added to `icons.jsx` in the same inline-SVG style (24×24 viewBox, `stroke="currentColor"`, `strokeWidth="2"`) as every other icon there.

## Testing
- Backend: `adminInventoryService`/`Controller` unit-ish tests following `adminProductService`/`adminOrderController`'s existing test file patterns — filter params, pagination bounds, computed `status`/`available`/`deficit`/`suggested_po_qty` values against known seeded fixtures.
- Frontend: one test file per new page (`AdminStockLedgerPage.test.jsx`, `AdminReorderQueuePage.test.jsx`, `AdminPurchaseOrdersPage.test.jsx`) following `AdminProductsPage.test.jsx`'s pattern (mocked fetch, renders stats/table rows, search/filter re-fetches with the right query params, 401 triggers logout).
- `AdminNav.test.jsx`: update for the new Inventory group — expand/collapse, auto-expand-on-active-subroute, all 3 sub-links present and correctly marked active per sub-route, existing 5 top-level-item assertions still pass with the new per-row active-background approach (assert via `.active` class, not the now-removed indicator).

## Self-review notes
- No placeholders; every field/column/endpoint above is fully specified.
- Consistent with the existing admin patterns confirmed by reading `adminProductController/Service.js`, `AdminProductsPage.jsx`, `AdminOrdersPage.jsx`'s badge overrides, and `AdminNav.jsx`'s current implementation.
- Scope is one cohesive subsystem (3 views sharing the same new entities), not independent sub-projects — kept as a single spec per brainstorming-skill guidance, to be split into ordered tasks (schema → API → nav → 3 pages) during planning.
