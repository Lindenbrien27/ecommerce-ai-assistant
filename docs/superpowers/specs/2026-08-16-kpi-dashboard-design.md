# KPI Dashboard & Basic Reporting — Design

## Overview

The first sub-project of Phase 3 ("Analytics & Sales Tools"), decomposed into three independent pieces — KPI Dashboard, Discounts & Promo Code Engine, and Return/Refund (RMA) — of which this is the first to be built. Gives an admin a single at-a-glance view of store health: total revenue, order volume, average order value, and which products are actually selling. Built entirely on top of the existing `orders` table; no new tables, no migration.

Two real constraints shaped this design, both discovered during brainstorming:

- **`orders` and `products` are deliberately unlinked.** Orders store `product_name`/`product_icon` as a free-text snapshot captured at purchase time (so later catalog edits/deletes don't retroactively change historical orders) — there is no `product_id` foreign key. "Top products" is therefore computed by grouping `orders.product_name`, not by joining to the `products` table.
- **This page is not part of the Orders/Products dark-reskin work, and must not repeat the bleed-through bug that work found and fixed.** Orders and Products (already shipped) moved to a fixed, always-dark theme, each on its own dedicated CSS namespace — that namespace discipline exists specifically because `AdminProductsPage.jsx` was originally found to be *accidentally* dark, from reusing Orders' CSS classes by name. `AdminCustomersPage.jsx` still has that exact bug today (left as a deliberate, separate follow-up) — its current rendered look is accidentally dark, not its original light design. The Dashboard must not inherit that mistake a third time: it gets its own dedicated `.admin-dashboard-*` CSS classes, styled with this app's existing theme-adaptive `var(--color-*)` tokens (the same tokens `AdminCustomersPage.jsx`'s CSS rules were originally written against), not the fixed dark hex palette and not any shared `.admin-orders-*`/`.admin-products-*` class name. A future pass may extend the dark treatment here, following the shared `.admin-dark` token/utility layer recommended (but not yet built) after the Products reskin's final review.

## Architecture

A new admin-only triad, parallel to the existing order-manager/customer-CRM code:

```
src/services/adminDashboardService.js     → getDashboardStats()
src/controllers/adminDashboardController.js
src/routes/adminDashboardRoutes.js        → mounted at /api/admin/dashboard, gated by requireAdminAuth

frontend/src/components/AdminNav.jsx      → add a 4th tab: Dashboard (existing: Orders | Products | Customers)
frontend/src/pages/AdminDashboardPage.jsx → /admin/dashboard
```

`adminDashboardRoutes` mounts the same way the other three admin routers already do:

```js
app.use('/api/admin/dashboard', requireAdminAuth, adminDashboardRoutes);
```

`/admin` itself continues to be the Orders list (unchanged) — Dashboard is an additional tab, not a new landing page.

## Data Model

No migration. Every field is computed from `orders`. All aggregates exclude `status = 'cancelled'` orders (they generated no actual revenue) — the same convention `adminCustomerService.js`'s `TOTAL_SPENT_SQL` already established for per-customer totals, reused here at the whole-table level.

## Backend Endpoint

Requires `requireAdminAuth`.

### `GET /api/admin/dashboard`

Two queries in `getDashboardStats()`:

1. A single-row aggregate over non-cancelled orders:

```sql
SELECT COUNT(*) AS total_orders,
       SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_revenue_cents
FROM orders
WHERE status <> 'cancelled'
```

`total_orders` and `total_revenue_cents` come straight off this row. `average_order_value_cents` is computed in JS (`total_revenue_cents / total_orders`, both already `Number()`-coerced from Postgres's string-typed aggregate columns), guarded for `total_orders === 0` (returns `0`, not `NaN`/`Infinity`) — deliberately not computed in SQL, to sidestep a divide-by-zero there.

2. A `GROUP BY product_name` query, ranked by revenue, top 5:

```sql
SELECT product_name,
       MAX(product_icon) AS product_icon,
       SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS revenue_cents,
       COUNT(*) AS units_sold
FROM orders
WHERE status <> 'cancelled'
GROUP BY product_name
ORDER BY revenue_cents DESC, product_name ASC
LIMIT 5
```

`product_icon` is wrapped in `MAX()` because it's non-aggregated but stable per `product_name` in this app's seed/real data (every order for the same product name carries the same icon) — `MAX()` is a mechanical way to carry a single-valued column through a `GROUP BY` without adding it to the grouping key. `product_name ASC` is a deterministic tiebreaker for products with identical revenue.

Response shape:

```json
{
  "total_revenue_cents": 1245600,
  "total_orders": 42,
  "average_order_value_cents": 29657,
  "top_products": [
    { "product_name": "27\" 4K Monitor", "product_icon": "monitor", "revenue_cents": 189746, "units_sold": 3 }
  ]
}
```

## Frontend

- **`AdminNav.jsx`** (modified): add a fourth `NavLink` — "Dashboard" — pointing at `/admin/dashboard`, alongside the existing Orders/Products/Customers tabs. No layout restructuring; this stays the existing horizontal tab bar.
- **`AdminDashboardPage.jsx`** (new, `/admin/dashboard`): three stat cards (Total Revenue, Total Orders, Average Order Value — `formatCents`/plain integer respectively) above a plain table listing the top 5 products (icon via the existing `ProductImage` component keyed by `product_icon`, name, revenue, units sold). No charts, no trend lines, no time-range filter — a single all-time view. No pagination on the top-products table (fixed top 5).
- **Zero-orders state**: stat cards show `$0.00` / `0` / `$0.00`; the top-products table shows an explicit "No orders yet." empty row (built in from the start, not retrofitted the way some of the Orders/Products empty states were).

## Error Handling

- `401` via the existing `requireAdminAuth` gate; frontend calls `logout()` on 401, matching every other admin page.
- `500` with a generic "Something went wrong loading the dashboard." on any query failure, matching the existing `logError` + generic-message convention used across every other admin controller.
- Frontend surfaces a fetch failure inline (`role="alert"`), matching every other admin page.

## Testing

Following the established conventions:

- `adminDashboardService`: `getDashboardStats` — correct revenue/order-count/AOV math over a mix of cancelled and non-cancelled orders (cancelled excluded from both numerator and denominator), `average_order_value_cents` is `0` (not `NaN`) when `total_orders` is `0`, top-products ordering by revenue descending with the `product_name` tiebreaker, `product_icon` carried correctly via `MAX()`, top-products list capped at 5 even with more than 5 distinct product names.
- `adminDashboardController`/`adminDashboardRoutes`: `401` without a valid admin cookie, `200` with the exact response shape above on success, `500` surfaced as a generic message on a simulated query failure.
- Frontend: `AdminDashboardPage` renders the three stat cards from a mocked fetch with correct formatting, renders the top-5 table rows in the order the API returned them, renders the "No orders yet." empty state when `top_products` is `[]`, surfaces a fetch error inline, redirects via `logout()` on a `401`; `AdminNav` renders the new Dashboard tab with correct active-state highlighting on `/admin/dashboard`.

## Out of Scope

- Time-range filtering (7d/30d/90d/custom) — a single all-time view for this pass.
- Charts, trend lines, or any charting library dependency.
- Order-status breakdown (processing/shipped/delivered/cancelled counts) and low-stock inventory alerts — both considered during brainstorming and explicitly trimmed from this pass.
- Dark theme — ships in the app's existing default admin styling; a future pass may extend the Orders/Products dark treatment here.
- Pagination on the top-products table — fixed top 5, no "see all products" drill-down.
- Discounts & Promo Code Engine and Return/Refund (RMA) — the other two Phase 3 sub-projects, each its own future spec → plan → build cycle.
