# Admin Order List & Status Manager — Design

## Overview

The first sub-project of `components.md`'s "Phase 1: The Core Foundation" roadmap. Gives an authenticated admin a table of all customer orders (not scoped to one customer, unlike the existing `/api/orders` surface), with filtering and search, a detail view, and the ability to change an order's status. This is the admin analogue of the customer order-history feature already in the codebase, built to sit entirely behind the admin auth already shipped (Google OAuth login, `requireAdminAuth` middleware, `/admin` SPA route).

Two mismatches between `components.md`'s wording and the real schema were caught and resolved during brainstorming:

- **Statuses.** `components.md` describes `Pending → Processing → Shipped → Completed / Cancelled`. The real `orders.status` column (`migrations/1784973065584_initial-schema.sql`) is a `CHECK` constraint on exactly `'processing'`, `'shipped'`, `'out_for_delivery'`, `'delivered'`, `'cancelled'` — no `pending`, no `completed`, and an extra `out_for_delivery` step. This design uses the real five values. The status editor is a free-form dropdown of all five (no enforced linear workflow), per the user's explicit choice.
- **Shipping address.** `components.md`'s order detail page description mentions "shipping address." No such column exists anywhere in `orders` (confirmed against every order-related migration). It is out of scope — the detail page shows only real columns.

## Architecture

A parallel admin order surface, alongside (not modifying) the existing customer order code:

```
src/services/adminOrderService.js    → admin-wide queries (no customer_email filter; status filter, search, pagination)
src/controllers/adminOrderController.js
src/routes/adminOrderRoutes.js       → mounted at /api/admin/orders, gated by requireAdminAuth

frontend/src/pages/AdminOrdersPage.jsx        → becomes the /admin index route
frontend/src/pages/AdminOrderDetailPage.jsx   → /admin/orders/:orderNumber
```

`adminOrderRoutes` is mounted the same way `adminAuthRoutes` already is in `src/app.js`:

```js
app.use('/api/admin/orders', requireAdminAuth, adminOrderRoutes);
```

No new migration. `orders` already has every column this feature needs.

## Data Model

No schema changes. Reused columns: `order_number`, `customer_email`, `product_name`, `status`, `carrier`, `tracking_number`, `estimated_delivery`, `created_at`, `unit_price_cents`, `delivery_cost_cents`, `vat_cents`, `voucher_cents`, `voucher_code`, `product_icon`.

## Backend Endpoints

All three require `requireAdminAuth` (cookie-based admin session, already shipped).

### `GET /api/admin/orders?status=&q=&cursor=&limit=`

Lists orders across all customers. Mirrors the real keyset-pagination shape in `getOrdersByEmail` (`src/services/orderService.js`) exactly, minus the `customer_email` filter, plus optional `status`/`q`:

```sql
SELECT * FROM orders
WHERE ($1::text IS NULL OR status = $1)
  AND ($2::text IS NULL OR order_number ILIKE '%' || $2 || '%' OR customer_email ILIKE '%' || $2 || '%')
  AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4))
ORDER BY created_at DESC, id DESC
LIMIT $5
```

- `status`: one of the five real values, otherwise `400`.
- `q`: free-text search against `order_number` and `customer_email` (the two fields the admin table displays and would plausibly search by). Same param name (`q`) the rest of the codebase already uses for search.
- `cursor`/`limit`: same `encodeCursor`/`decodeCursor`, `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`, and `InvalidCursorError → 400` contract as `orderService.js`. `adminOrderService.js` imports `encodeCursor`/`decodeCursor`/`InvalidCursorError` from `orderService.js` rather than duplicating them — they're pagination-shape helpers, not customer-scoped logic.
- Not cached. The existing `orderCache` is sized and TTL'd for the customer-facing read path; admin list queries are lower-volume and admins need current data more than a 60s cache buys latency. `getAdminOrders` bypasses `orderCache` entirely.

### `GET /api/admin/orders/:orderNumber`

Reuses `getOrderByNumber` from `orderService.js` unchanged (no `customer_email` check — admin sees every order) rather than duplicating the lookup or its cache handling. `404` if not found, matching the existing 404-not-403 convention in `orderController.js`'s `getOrder` (there's no "wrong owner" case here — admin isn't scoped to an owner — so this is a plain existence check).

### `PATCH /api/admin/orders/:orderNumber/status`

Body: `{ status: '<one of the five values>' }`.

```sql
UPDATE orders SET status = $1 WHERE order_number = $2 RETURNING *
```

- `400` if `status` isn't one of the five real values.
- `404` if `orderNumber` doesn't exist (no row returned).
- **Cache invalidation.** `config/cache.js` currently documents `orderCache` as safe because "orders are effectively read-only... nothing exposed here ever writes to it" — this endpoint is exactly the "admin tool" that comment already anticipated as the future exception. After a successful update, `adminOrderService.js` calls `orderCache.delete(`order:${orderNumber}`)` so the customer-facing `GET /api/orders/:id` and the chat tool's `get_order_by_number` (both of which read through `getOrderByNumber`'s cache) don't keep serving the pre-update status for up to the existing 60s TTL. The `list:${email}:...` cache entries are not individually invalidated — bounded by the same 60s TTL, and a customer's own order list briefly showing a status that's about to update is an acceptable staleness window (same bound that already exists today for any other reason a row might change). The stale-comment in `config/cache.js` is updated alongside this change to reflect that a real invalidation path now exists.
- On success: `auditLog('admin.order.status_updated', { orderNumber, from: <previous status>, to: <new status>, admin: req.admin.email })`, matching the `auditLog(event, details)` convention used by `adminAuthController.js` and `orderController.js`.

## Frontend

- **`AdminOrdersPage.jsx`** (replaces the current placeholder as the `/admin` index route): table of orders (order number, customer email, product, status, created date). Status filter (dropdown of the five values + "All"), search box (`q`), keyset "Load more" / cursor-based pagination consistent with how `OrdersPage.jsx` already consumes `nextCursor`.
- **`AdminOrderDetailPage.jsx`** at `/admin/orders/:orderNumber`: full order details (items, pricing breakdown, carrier/tracking, dates) and the status-change control (dropdown + save button, calls the `PATCH` endpoint, shows the updated status on success).
- Both pages live under the existing `/admin/*` route branch in `App.jsx`, behind `AdminProtectedRoute`, using `AdminAuthContext` exactly as the current placeholder dashboard does — no changes to routing structure beyond swapping in these two pages.

## Error Handling

- Invalid `status` value (list filter or PATCH body): `400` with a message naming the allowed values.
- Invalid `cursor`: `400`, same `InvalidCursorError` contract as the customer endpoint.
- Unknown `orderNumber` (detail or PATCH): `404`.
- Not authenticated / expired admin session: `401`, handled by the existing `requireAdminAuth` middleware (unchanged) — the frontend pages redirect to `/admin/login` on `401` the same way `AdminProtectedRoute` already does.
- Frontend surfaces fetch failures inline (existing `role="alert"` pattern used by `AdminLoginForm.jsx`), not silently.

## Testing

Following this codebase's existing `node:test`/`node:assert` (backend) and Vitest + Testing Library (frontend) conventions:

- `adminOrderService`: pagination correctness (matches, cursor boundaries, empty results), status filter, `q` search across both fields, `InvalidCursorError` on a malformed cursor, cache invalidation on status update (`orderCache` no longer returns the stale value after `updateOrderStatus`).
- `adminOrderController`: status validation (`400` on bad value), 404 on unknown order number, `auditLog` called with the right event/details on a successful status change.
- `adminOrderRoutes`: `requireAdminAuth` actually gates all three routes (a request without a valid admin cookie gets `401`, never reaches the handler).
- Frontend: `AdminOrdersPage` renders rows from a mocked fetch, filter/search re-fetch with the right query params, pagination "Load more" appends using `nextCursor`; `AdminOrderDetailPage` renders order fields, status change POSTs the right body and reflects the new status on success, surfaces an alert on failure.

## Out of Scope

- RBAC / Admin-vs-Staff permissions (next sub-project in `components.md`'s Phase 1).
- Product management, store/payment settings (later sub-projects).
- Bulk status updates, CSV export, order creation/deletion by an admin.
- Shipping address (doesn't exist in the schema).
- Any change to customer-facing order code beyond the one cache-invalidation call and the `config/cache.js` comment update described above.
