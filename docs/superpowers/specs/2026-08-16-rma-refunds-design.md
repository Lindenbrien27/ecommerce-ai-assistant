# Return & Refund (RMA) Processing — Design

## Overview

The third and final sub-project of Phase 3. Lets an admin process a full or partial refund against an existing order and, optionally, restore the returned item to stock. Built entirely on the existing `orders`/`products` tables plus four new columns on `orders`; no new table.

One real discovery shaped this design: **`'returned'` already exists as a fully-styled order status across the customer-facing frontend** (`OrdersPage.jsx`'s `HISTORY_BADGE` map has a complete `returned: { label: 'Returned', icon: UndoIcon, className: 'status-returned' }` entry, with matching CSS in `index.css`) — it was simply never assignable to a real order, because nothing ever set it. This plan uses `'returned'` as the new terminal order status (added to the `status` CHECK constraint) rather than inventing a `'refunded'` value, so the customer-facing order history already renders it correctly with zero customer-frontend changes needed.

Refund amount and stock restoration are independent, admin-controlled choices — not one derived from the other. A partial refund (e.g. a goodwill discount for a shipping delay) doesn't imply the item came back; a full return does. The admin specifies both explicitly: a refund amount (capped at what the order actually totals) and a restock checkbox.

## Architecture

Extends the existing admin order-manager code rather than adding a new triad — this is one more action on an existing order, not a new resource:

```
migrations/<ts>_add-order-refund-fields.sql

src/services/adminOrderService.js        → add refundOrder(orderNumber, { amountCents, restock, reason })
src/controllers/adminOrderController.js  → add refundOrder(req, res)
src/routes/adminOrderRoutes.js           → add POST /:orderNumber/refund

frontend/src/pages/AdminOrderDetailPage.jsx → add a third "Refund" section, alongside the existing Status and Shipping sections
frontend/src/index.css                       → add .order-status-badge.returned (OrderDetailPage's own detail-hero badge; OrdersPage's list-row badge already has this)
```

## Data Model

```sql
ALTER TABLE orders
  ADD COLUMN refund_amount_cents INTEGER,
  ADD COLUMN refund_reason TEXT,
  ADD COLUMN restocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN refunded_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'));
```

At most one refund per order — `refunded_at IS NOT NULL` means this order has already been refunded, and a second attempt is rejected (`409`). `restocked` records what actually happened (see below), not what was requested.

**Products aren't linked to orders by a foreign key** (the same deliberate constraint the KPI Dashboard's top-products query already works around) — restocking matches by `orders.product_name = products.name`. If the product was renamed or deleted since the order was placed, no row matches, and the refund still succeeds financially but `restocked` comes back `false` — the admin sees this in the response and isn't misled into thinking stock was restored when it wasn't.

## Backend Endpoint

### `POST /api/admin/orders/:orderNumber/refund`

Admin-only. Body: `{ amount_cents, restock, reason }`.

- `404` if the order doesn't exist.
- `409` if `refunded_at` is already set (`already refunded`).
- `400` if `amount_cents` isn't a positive integer, or exceeds the order's actual total (`unit_price_cents + delivery_cost_cents + vat_cents - voucher_cents`, the same formula `TOTAL_SPENT_SQL`/`computeOrderTotal` already use elsewhere in this app, computed server-side here since there's no shared frontend/backend module boundary in this codebase).
- On success: if `restock` is truthy, attempts `UPDATE products SET stock_quantity = stock_quantity + 1 WHERE name = $1` (single unit — every order in this schema is one product) and records whether it actually matched a row. Sets `status = 'returned'`, `refund_amount_cents`, `refund_reason` (nullable), `restocked`, `refunded_at = now()`. Returns the updated order.
- Same cache-invalidation as `updateOrderStatus`/`updateOrderShipping` already do (`order:${orderNumber}` plus that customer's `list:${email}:*` entries) — this endpoint changes `status`, so it needs the identical invalidation those two already perform.

## Frontend

`AdminOrderDetailPage.jsx` gets a third section, following the exact state/handler shape its existing Status and Shipping sections already use:

- **Already refunded** (`order.refunded_at` set): a read-only summary — amount refunded, whether stock was restored, the date, and the reason if one was given.
- **Not yet refunded**: an amount input (defaulting to the order's full total, editable down for a partial refund), a "Restore to stock" checkbox (defaulting checked), an optional reason textarea, and a "Process Refund" button. Errors surface inline via the existing `verify-error` convention.

## Error Handling

Matches every other admin-order mutation already on this page: `401` → `logout()`; `400`/`409` surfaced inline; `500` generic message via `logError`.

## Testing

- `adminOrderService.refundOrder`: rejects a second refund on an already-refunded order (`409`), rejects an amount over the order's real total and a non-positive amount (`400`), correctly restocks when the product name still matches a live row, correctly reports `restocked: false` without erroring when it doesn't (renamed/deleted product), sets `status = 'returned'` and all four new columns on success, invalidates the same cache entries the other two mutations do.
- Route: `401`/`404`/`409`/`400` status codes, a full round-trip `200` with the expected response shape.
- Frontend: renders the refund form pre-filled with the order's total; submits the right body; shows the already-refunded summary when `refunded_at` is set instead of the form; surfaces a `409`/`400` inline.

## Out of Scope

- Multiple partial refunds accumulating against one order — one refund event per order, matching this schema's one-product-per-order model.
- Any change to `CheckoutPage.jsx` or a real order-placement flow — neither exists in this app, unrelated to this feature.
- Automatic email notification to the customer on refund (the existing shipping-update flow emails; refund does not, to keep this pass scoped — a natural follow-up, not built here).
- Customer-initiated return requests — this is an admin-only action, not a customer-facing self-service flow.
