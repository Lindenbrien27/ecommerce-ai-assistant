# Customer Database (CRM) — Design

## Overview

The second sub-project of `components.md`'s "Phase 2: Fulfillment & Customer Service" roadmap. Gives an admin a customer-centric view of the store — a searchable list of customers and, per customer, their contact info and full order history — built entirely on top of the admin order-manager work already shipped. No new tables, no migration.

Two real gaps were found and resolved during brainstorming:

- **There is no customer entity in this schema.** A `customer_profiles` table exists from an earlier account-settings project, but it was never seeded, and no backend route or frontend page reads or writes it (`frontend/src/components/ProfileMenu.jsx`'s own comment confirms "this app only has an email per customer"). A customer here is defined purely as "whoever has placed at least one order" — the list is derived live from distinct `customer_email` values in `orders`, not a new persisted entity.
- **The admin panel has zero navigation.** `/admin` and `/admin/orders/:orderNumber` are bare pages with no shared header or way to move between sections — invisible with one admin section, concrete the moment a second (Customers) exists. This project adds a minimal shared nav bar as part of its scope.

The roadmap's "order lookup by Order ID or Customer Email" line is already built — the admin Orders page's search box does exactly this. This project does not rebuild it; customer order-history rows link out to the existing `/admin/orders/:orderNumber` page.

## Architecture

A new admin-only layer parallel to the existing order-manager code, plus one shared layout addition:

```
src/services/adminCustomerService.js     → getCustomers(), getCustomerSummary(email)
src/controllers/adminCustomerController.js
src/routes/adminCustomerRoutes.js        → mounted at /api/admin/customers, gated by requireAdminAuth

frontend/src/components/AdminNav.jsx     → minimal shared nav (Orders | Customers, admin email, logout)
frontend/src/pages/AdminCustomersPage.jsx        → /admin/customers
frontend/src/pages/AdminCustomerDetailPage.jsx   → /admin/customers/:email
```

`adminCustomerRoutes` mounts the same way `adminOrderRoutes` already does:

```js
app.use('/api/admin/customers', requireAdminAuth, adminCustomerRoutes);
```

`AdminNav` wraps the existing admin routes as a layout route in `App.jsx`, the same way the customer-facing `Layout.jsx` wraps its own protected routes — just far smaller (a tab bar, not a full sidebar shell).

## Data Model

No migration. Every field comes from `orders`, aggregated by `customer_email`. "Contact details" (recipient name, shipping address) are read from a customer's most recent order — there's no account-level contact info anywhere in this schema beyond the email itself.

## Backend Endpoints

All three require `requireAdminAuth`.

### `GET /api/admin/customers?q=&page=&limit=`

The customer list:

```sql
SELECT customer_email,
       COUNT(*) AS order_count,
       SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_spent_cents,
       MAX(created_at) AS last_order_at
FROM orders
WHERE ($1::text IS NULL OR customer_email ILIKE $1)
GROUP BY customer_email
ORDER BY last_order_at DESC, customer_email ASC
LIMIT $2 OFFSET $3
```

`q` filters by email substring (same `%q%` ILIKE convention as the order list's search). Offset-based pagination (`page`/`limit`, not a cursor) — customer cardinality grows far slower than order cardinality, so the offset-scan cost that motivated keyset pagination on the order list doesn't apply here in the same way. `hasMore` is determined the same way the order list already does it: fetch `limit + 1` rows, trim to `limit`, and report whether an extra row came back. `customer_email` is a deterministic tiebreaker on `last_order_at` (two customers can share a timestamp in the seed data).

Orders with no pricing data (`unit_price_cents IS NULL`) contribute `0` to `total_spent_cents` rather than being excluded from `order_count` — an order that exists but has no recorded price is still a real order.

### `GET /api/admin/customers/:email`

One customer's detail: the same aggregate query, scoped to one email (`WHERE customer_email = $1 GROUP BY customer_email`), plus the first page of their orders via `orderService.getOrdersByEmail(email, { limit, cursor })` — the exact function the customer-facing order history already uses, called here with an admin-supplied email rather than `req.customerEmail`. `404` if the aggregate query returns no rows (this email has never placed an order — not a real customer in this app's terms). Response shape:

```json
{
  "email": "jane.doe@example.com",
  "orderCount": 5,
  "totalSpentCents": 145000,
  "lastOrderAt": "2026-07-24T00:00:00Z",
  "orders": [ /* same shape as getOrdersByEmail's orders array */ ],
  "nextCursor": "..."
}
```

Contact info (recipient name, shipping address) is not a separate field — the frontend reads it from `orders[0]` (the most recent order, already first in the DESC-sorted list).

### `GET /api/admin/customers/:email/orders?cursor=&limit=`

Pagination-only endpoint for "Load more" beyond the first page. Directly calls `orderService.getOrdersByEmail(email, { limit, cursor })` and returns its `{ orders, nextCursor }` shape unchanged — no new pagination logic, this endpoint exists only because the admin route needs its own `requireAdminAuth` gate that the customer-facing `/api/orders` route (locked to `req.customerEmail`) can't provide.

## Frontend

- **`AdminNav.jsx`** (new): a small top bar — "Orders" / "Customers" tab links (`NavLink` active-state styling, matching the existing `.order-filter-tab`/nav conventions this app already uses elsewhere), the signed-in admin's email, and a logout button (reusing `useAdminAuth()`'s existing `logout()`). Rendered once, above the routed admin content, via a layout route wrapping the existing `AdminOrdersPage`/`AdminOrderDetailPage` and the two new pages below.
- **`AdminCustomersPage.jsx`** (new, `/admin/customers`): a table (email, order count, total spent, last order date) with a search box (`q`), server-side filtering and "Load more" pagination — same shape as `AdminOrdersPage.jsx`. Each row links to `/admin/customers/:email`.
- **`AdminCustomerDetailPage.jsx`** (new, `/admin/customers/:email`): header showing the recipient name/address from the customer's most recent order, the three aggregate stats (order count, total spent, last order date), and a list of their orders (order #, product, status, date) each linking to `/admin/orders/:orderNumber`, with "Load more" pagination via the third endpoint.

## Error Handling

- `404` for `GET /api/admin/customers/:email` when the email has no orders.
- `400` for a non-integer `limit`/`page` (matching the existing `parseLimit` convention).
- `401` via the existing `requireAdminAuth` gate; frontend calls `logout()` on 401 exactly like the other admin pages.
- Frontend surfaces failures inline (`role="alert"`), matching every other admin page.

## Testing

Following the established conventions:

- `adminCustomerService`: `getCustomers` — pagination correctness (`hasMore`/trimming, tiebreaker ordering), `q` filtering, orders-with-no-pricing contributing `0` not excluding the customer; `getCustomerSummary` — returns `null`/undefined for an email with no orders, correct aggregate math for a multi-order customer.
- `adminCustomerController`: `404` on unknown email, `400` on invalid `limit`/`page`, correct reuse of `orderService.getOrdersByEmail` (mocked) for both the detail and pagination-only endpoints.
- `adminCustomerRoutes`: `401` without a valid admin cookie on all three endpoints.
- Frontend: `AdminNav` renders both tabs with correct active-state highlighting per route, logout button works; `AdminCustomersPage` renders rows from a mocked fetch, search re-fetches with the right query param, pagination appends via `nextCursor`; `AdminCustomerDetailPage` renders contact info from `orders[0]`, the three stats, the order list with correct links, 404 surfaced as an alert, "Load more" appends via the third endpoint.

## Out of Scope

- A real `customers` table, customer editing, or any customer data beyond what's derivable from `orders`.
- Customer-initiated actions (merging duplicate emails, editing a customer's own contact info) — this is a read-only admin view.
- A second, customer-scoped order search — the existing Orders page search already covers "search by order # or email."
- RBAC/permissions, Product Management, Store & Payment Settings, and Product Variants & Inventory Guard remain separate, not-yet-built work from the broader roadmap.
