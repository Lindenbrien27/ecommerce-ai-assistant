# Invoice & Shipping Label Generation — Design

## Overview

The first sub-project of `components.md`'s "Phase 2: Fulfillment & Customer Service" roadmap. Gives an admin, from the existing order-detail page, the ability to download a real PDF invoice and packing slip for an order, and to enter/update a carrier + tracking number that automatically emails the customer a shipping update. Builds directly on the admin order-manager feature just shipped (`AdminOrderDetailPage.jsx`, `requireAdminAuth`, `orderService.getOrderByNumber`) — no new pages, no new auth surface.

Two real gaps were found and resolved during brainstorming, both grounded in the actual code rather than assumed:

- **No shipping address exists anywhere.** Not on `orders`, not collected at checkout. A packing slip needs a real ship-to address, so this project adds one directly to `orders` (structured columns, mirroring the shape the now-dropped `customer_addresses` table used) plus a backfill migration for existing seed data.
- **`CheckoutPage.jsx` has no real backend.** Its cart items are hardcoded fabricated data and "Continue" only simulates a processing spinner — nothing there ever creates a real `orders` row. Because of this, the shipping-address work is scoped to the column + backfill only; `CheckoutPage.jsx` is explicitly untouched. Every *real* order in the system (seeded or admin-created) gets a real address; the fabricated checkout mockup is a separate, unrelated concern.

## Architecture

Three additions, all admin-only and gated by the existing `requireAdminAuth`, layered onto the order-manager work already shipped:

```
migrations/<ts>_add-shipping-address-to-orders.sql       → schema
migrations/<ts>_backfill-order-shipping-addresses.sql    → seed data

src/services/pdfService.js         → buildInvoicePdf(order), buildPackingSlipPdf(order)
src/services/emailService.js       → + sendShippingUpdateEmail(email, order)  (existing file, new export)
src/services/adminOrderService.js  → + updateOrderShipping(orderNumber, { carrier, trackingNumber })  (existing file, new export)
src/controllers/adminOrderController.js → + getInvoicePdf, getPackingSlipPdf, updateShipping  (existing file, new handlers)
src/routes/adminOrderRoutes.js     → + GET /:orderNumber/invoice.pdf, GET /:orderNumber/packing-slip.pdf, PATCH /:orderNumber/shipping

frontend/src/pages/AdminOrderDetailPage.jsx → + Shipping section, + two PDF download links  (existing file, extended)
```

No new frontend pages, no new auth. `pdfkit` is added as a new backend dependency (pure-JS, no native build step, well-suited to the text/table-heavy layout these documents need).

## Data Model

`migrations/<ts>_add-shipping-address-to-orders.sql`:

```sql
ALTER TABLE orders
  ADD COLUMN recipient_name TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN postal_code TEXT,
  ADD COLUMN country TEXT;
```

Nullable, not `NOT NULL` — this mirrors how `carrier`/`tracking_number` are already nullable on `orders` (an order can exist before it has shipping info). `recipient_name` is separate from `customer_email`/`customer_profiles.name` since a shipment's recipient can differ from the account holder (an office, a gift recipient) — the same reasoning the now-dropped `customer_addresses` table used.

A second migration, `migrations/<ts>_backfill-order-shipping-addresses.sql`, sets a real, plausible address on every existing seed order (keyed by `order_number`, matching the style of the existing `add-lindenbrien-volume-history-orders.sql` seed migration) — no order is left with a placeholder like "N/A" or an empty string.

## Backend

### PDF generation — `src/services/pdfService.js`

- `buildInvoicePdf(order)` → returns a `Buffer`. Content: order number, order date, recipient name + full address, product name, and the same pricing breakdown `frontend/src/utils/invoice.js`'s `buildInvoiceLines` already computes (unit price, delivery, VAT, voucher, total) via `computeOrderTotal`-equivalent logic reused from `orderService`/`pricing` conventions. This is a separate, admin-only document — it does not replace or touch the customer's existing plain-text invoice download.
- `buildPackingSlipPdf(order)` → returns a `Buffer`. Content: order number, recipient name + full address, product name, quantity (1 — this schema has no multi-line-item support). Deliberately omits all pricing, the standard real-world convention for a document warehouse staff handle (they don't need to know what the customer paid).
- Both functions return `null` if the order has no shipping address on file (mirroring `computeOrderTotal`'s "skip entirely, don't render a document with holes in it" convention) — the controller turns a `null` into a `409` (see Error Handling).

### New endpoints on the existing admin order routes

- `GET /api/admin/orders/:orderNumber/invoice.pdf`
- `GET /api/admin/orders/:orderNumber/packing-slip.pdf`

Both: look up the order via `orderService.getOrderByNumber` (identical to the existing admin detail endpoint — no ownership check, admin sees every order), `404` if not found, `409` if the order has no shipping address (`buildInvoicePdf`/`buildPackingSlipPdf` returned `null`), otherwise stream the PDF buffer with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="invoice-<orderNumber>.pdf"` (or `packing-slip-<orderNumber>.pdf`).

- `PATCH /api/admin/orders/:orderNumber/shipping`

Body: `{ carrier, trackingNumber }` (both required, non-empty strings — free text, not an enum, since carriers/tracking formats vary). `400` if either is missing/empty. `404` if the order doesn't exist. On success:

```js
// adminOrderService.js
async function updateOrderShipping(orderNumber, { carrier, trackingNumber }) {
  const { rows } = await pool.query(
    'UPDATE orders SET carrier = $1, tracking_number = $2 WHERE order_number = $3 RETURNING *',
    [carrier, trackingNumber, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) orderCache.delete(`order:${orderNumber}`);
  return order;
}
```

Same cache-invalidation pattern `updateOrderStatus` already established (Task 1 of the order-manager plan) — this is the second write path through `orderCache`, and needs the identical treatment for the identical reason.

The controller compares the previous carrier/tracking (fetched the same way `updateStatus`'s audit log already does — via `orderService.getOrderByNumber` before the write) against the new values. Only when they actually differ does it call `emailService.sendShippingUpdateEmail(order.customer_email, updatedOrder)` — a no-op re-save (admin clicks Save without changing anything) must not re-notify the customer. `auditLog('admin.order.shipping_updated', { orderNumber, carrier, trackingNumber, emailed: <bool>, admin: req.adminEmail })` on success, matching the existing `admin.order.status_updated` convention.

### `emailService.js` — new export

`sendShippingUpdateEmail(email, order)` follows the exact existing `sendOtpEmail` pattern (`isConfigured()` guard, same `transporter`, returns whether it actually sent): subject `Your order <order_number> has shipped`, body includes carrier, tracking number, and product name. Like `sendOtpEmail`, a `false` return (SMTP not configured) is not itself an error — the shipping-update PATCH still succeeds; the caller just couldn't notify the customer, and that's reflected in the audit log's `emailed` field, not surfaced as a failure to the admin.

## Frontend

`AdminOrderDetailPage.jsx` gains two additions to its existing field list and layout, both scoped inside the same component (no new page, no new route):

- A **Shipping** section below the existing fields: displays the recipient name + address read-only (or "No shipping address on file" if absent), plus a small form (carrier + tracking number inputs, its own Save button, independent from the status editor's Save). On success, shows a confirmation message — distinguishing "Shipping info updated." from "Shipping info updated and customer notified." based on the response's `emailed` field, so the admin knows whether the customer was actually emailed.
- Two **download links** — `<a href="/api/admin/orders/:orderNumber/invoice.pdf">Download Invoice</a>` and the packing-slip equivalent — plain links, not fetch-driven buttons, since the browser's native download handling is exactly what's needed here and avoids reimplementing blob/download logic client-side (same reasoning `downloadInvoice`'s existing Blob approach uses on the customer side, just via a real URL instead of a client-built Blob). If the order has no shipping address, both links are disabled/hidden with an explanatory note instead of linking to a `409`.

Both additions reuse the page's existing 401-handling (Task from the order-manager fix wave — `logout()` on a 401 response) for the new PATCH call.

## Error Handling

- `404` unknown order — all three new endpoints, same as the existing admin order endpoints.
- `409` no shipping address on file — both PDF endpoints, distinguishing "the order doesn't exist" from "the order exists but can't produce this document yet."
- `400` missing/empty `carrier` or `trackingNumber` — the shipping-update endpoint.
- `401` — all three, via the existing `requireAdminAuth` router-level gate; frontend calls `logout()` on 401 exactly like the rest of the admin order pages already do.
- Frontend surfaces failures inline (`role="alert"`), matching every other admin page in this app.

## Testing

Following the established conventions (service-level tests mock `pool.query` directly; route-level tests use the `withServer`/`issueAdminToken` pattern from `test/adminOrders.test.js`):

- `pdfService`: `buildInvoicePdf`/`buildPackingSlipPdf` return a non-empty `Buffer` for an order with a full address and full pricing data; return `null` for an order with no address; packing slip never contains a price string, invoice does.
- `adminOrderService.updateOrderShipping`: runs the right `UPDATE`, returns `null` for an unknown order, invalidates the `order:${orderNumber}` cache entry on success (same test shape as `updateOrderStatus`'s existing cache-invalidation test).
- `emailService.sendShippingUpdateEmail`: returns `false` when unconfigured (mocking `isConfigured`), sends with the right `to`/subject when configured (mocking the transporter, matching `sendOtpEmail`'s existing test pattern if one exists, or establishing it if not).
- Route tests (`test/adminOrders.test.js` or a new `test/adminOrderShipping.test.js`): `401` without a cookie on all three endpoints; `404` for an unknown order on all three; `409` for a missing address on both PDF endpoints; `400` for a missing `carrier`/`trackingNumber`; a successful `PATCH .../shipping` with a real change triggers the email (assert via a mocked transporter/`sendMail` call), a no-op re-save (same carrier/tracking as before) does not.
- Frontend: `AdminOrderDetailPage.test.jsx` gains tests for rendering the shipping section (with and without an address on file), a successful shipping-update save showing the right confirmation copy for both the emailed and not-emailed cases, a `400`/`404` surfaced as an alert, and the two download links pointing at the right URLs (present when an address exists, absent/disabled otherwise).

## Out of Scope

- `CheckoutPage.jsx` — explicitly untouched; it has no real backend to attach an address to, and touching it would be cosmetic-only work unrelated to real order data.
- Multi-line-item orders / multiple packages per order — this schema has one product per order; packing slips assume qty 1, matching every other part of this codebase's order handling.
- A real shipping-label file format (e.g. a carrier-specific label PDF/ZPL) — "shipping label" in the roadmap's own wording turned out, on inspection, to mean "enter a tracking number to notify the customer," not printing an actual carrier shipping label; this spec builds what the roadmap's sub-bullets actually describe.
- Editing/removing a shipping address once set, or letting an admin add one where none exists — out of scope for this pass; every real order already gets one via the backfill, and there's no described workflow yet for an admin manually entering one for a hypothetical future order-creation path.
