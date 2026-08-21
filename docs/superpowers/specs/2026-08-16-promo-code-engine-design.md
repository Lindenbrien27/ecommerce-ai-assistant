# Discounts & Promo Code Engine — Design

## Overview

The second sub-project of Phase 3 ("Analytics & Sales Tools"). Gives an admin a real, working promo-code system — create percentage or fixed-amount codes, set usage limits and expiration dates — and wires real customer-facing code entry into the one cart page that's actually functional in this app.

One real constraint shaped this design, found during exploration:

- **This app's checkout is entirely fabricated.** `CheckoutPage.jsx`'s own comment says so outright: "this app has no real cart/checkout backend" — its cart items, prices, and the existing "SPRING15" promo input are all invented, static content, not wired to anything. There is no live order-placement endpoint anywhere in this app (real `orders` rows only ever come from seed migrations). `BagPage.jsx`, by contrast, is fully real — it reads from `CartContext`, computes a real subtotal from live product prices, and currently hardcodes a fake always-on 15% discount with a static "✓ HAPPY2026" pill (no input, nothing to type). Given that, this project's customer-facing scope is **`BagPage.jsx` only** — replacing that hardcoded 15% with a real promo-code input validated against the database. Wiring anything into `CheckoutPage.jsx` would mean adding real backend logic behind fabricated, design-reference-only UI, which nothing downstream of it can ever actually use.
- A consequence of the above: since no real purchase ever completes in this app, "usage" for a `usage_limit` is defined as *successful application in the cart* (each time `POST /api/promo-codes/validate` succeeds, `usage_count` increments by 1) — not "used in a completed order." This is documented explicitly so it isn't mistaken for a bug later: applying, removing, and re-applying the same code across multiple visits each counts as a separate use.

## Architecture

A new admin-only CRUD triad (mirroring `adminProductService.js`/`adminProductController.js`/`adminProductRoutes.js` exactly) plus one new public, customer-authenticated validation endpoint:

```
migrations/<ts>_add-promo-codes-table.sql

src/services/promoCodeService.js          → validateAndApplyPromoCode(code, subtotalCents)
src/services/adminPromoCodeService.js     → getPromoCodes(), createPromoCode(), updatePromoCode(), deletePromoCode()
src/controllers/promoCodeController.js
src/controllers/adminPromoCodeController.js
src/routes/promoCodeRoutes.js             → mounted at /api/promo-codes, gated by requireCustomerAuth + a new promoLimiter
src/routes/adminPromoCodeRoutes.js        → mounted at /api/admin/promo-codes, gated by requireAdminAuth
src/middleware/rateLimiter.js             → add promoLimiter (customer-keyed, same shape as chatLimiter/ordersLimiter)

frontend/src/components/AdminNav.jsx      → add a 5th tab: Promo Codes (after Customers)
frontend/src/pages/AdminPromoCodesPage.jsx      → /admin/promo-codes (list + create/edit inline or via a form page)
frontend/src/pages/AdminPromoCodeFormPage.jsx   → /admin/promo-codes/new, /admin/promo-codes/:code/edit
frontend/src/pages/BagPage.jsx            → modified: real promo-code input replacing the hardcoded 15%/HAPPY2026 UI
```

Mount points follow the exact existing convention:

```js
app.use('/api/promo-codes', requireCustomerAuth, promoLimiter, promoCodeRoutes);
app.use('/api/admin/promo-codes', requireAdminAuth, adminPromoCodeRoutes);
```

The admin pages use this app's original theme-adaptive `var(--color-*)` tokens on their own dedicated `.admin-promo-codes-*` CSS namespace — never a fixed dark palette, never any `.admin-orders-*`/`.admin-products-*`/`.admin-dashboard-*` class name, for the exact reason documented in this session's earlier Orders/Products/Dashboard work (reusing another page's class names by name, not by design, was a real bug found and fixed twice already).

## Data Model

New table, one migration:

```sql
CREATE TABLE promo_codes (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `code` is the primary key, always stored and matched uppercase (normalized on write, so lookups are a plain equality check, not `ILIKE`/`UPPER()` on every read).
- `discount_value` is a whole integer: for `percentage`, 1-100 (whole percent); for `fixed`, cents (matching every other money field in this schema).
- `usage_limit` NULL means unlimited. `usage_count` starts at 0 and increments only via a successful `POST /api/promo-codes/validate` call (see Overview).
- `expires_at` NULL means it never expires.
- `active` is the day-to-day on/off switch (an admin can disable a code without losing its `usage_count` history) — `DELETE` is also supported for a code that was created by mistake and never used, matching `products`' own full-CRUD precedent.

## Backend Endpoints

### `GET /api/admin/promo-codes`

Admin-only, no pagination (matching the original, pre-reskin `AdminProductsPage.jsx` pattern — this list is expected to stay small, and nothing in the roadmap asks for browsing at scale). Returns every code, `ORDER BY created_at DESC`.

### `POST /api/admin/promo-codes`

Body: `{ code, discount_type, discount_value, usage_limit, expires_at }`. Validation (in `adminPromoCodeService.js`, following `adminProductService.js`'s `ValidationError`/`ConflictError` pattern exactly):
- `code` required, non-empty, uppercased and trimmed before insert.
- `discount_type` required, one of `'percentage'`/`'fixed'`.
- `discount_value` required positive integer; if `discount_type === 'percentage'`, must additionally be `<= 100`.
- `usage_limit` optional, if present must be a positive integer.
- `expires_at` optional, if present must be a valid ISO date string.
- Duplicate `code` (same `23505` Postgres unique-violation path `adminProductService.js` already uses) → `409`.

### `PATCH /api/admin/promo-codes/:code`

Partial update, same merge-with-existing-row pattern `adminProductService.updateProduct` already uses — any subset of `discount_type`/`discount_value`/`usage_limit`/`expires_at`/`active` may be sent; `code`/`usage_count`/`created_at` are never updatable via this endpoint. Same validation rules as create apply to whichever fields are present.

### `DELETE /api/admin/promo-codes/:code`

Hard delete, `404` if the code doesn't exist — identical shape to `adminProductService.deleteProduct`.

### `POST /api/promo-codes/validate`

Customer-authenticated (`requireCustomerAuth`), rate-limited (`promoLimiter`). Body: `{ code, subtotal_cents }`. `subtotal_cents` is the caller's current cart subtotal — needed because a fixed-amount discount is capped at the subtotal (never a negative total) and the response's `discount_cents` is computed server-side so the client never has to reimplement the discount math to trust it.

Validation order, each with a distinct, frontend-distinguishable failure:
1. Code not found (case-insensitive lookup via uppercasing the input before the query) → `404 { error, reason: 'not_found' }`.
2. `active = false` → `404 { error, reason: 'inactive' }` (same status as not-found — an inactive code shouldn't be distinguishable from a nonexistent one to a probing client, matching this app's existing OTP-endpoint enumeration-resistance convention).
3. `expires_at` in the past → `400 { error, reason: 'expired' }`.
4. `usage_limit` non-null and `usage_count >= usage_limit` → `400 { error, reason: 'usage_limit_reached' }`.
5. Success → increments `usage_count` by 1 (single `UPDATE ... WHERE code = $1 AND usage_count < COALESCE(usage_limit, usage_count + 1) RETURNING *`-style guarded update, so two concurrent requests against the last remaining use can't both succeed) and returns:

```json
{ "code": "SPRING15", "discount_type": "percentage", "discount_value": 15, "discount_cents": 2010 }
```

`discount_cents` here is the amount computed against the request's `subtotal_cents` at apply-time (`percentage`: `round(subtotal_cents * discount_value / 100)`; `fixed`: `min(discount_value, subtotal_cents)`) — the frontend will *also* recompute this reactively client-side (see Frontend below) so a subtotal change after applying doesn't leave a stale discount amount, but the server's own returned value is what proves the apply succeeded and is used for the first render.

## Frontend

### Admin

- **`AdminNav.jsx`** (modified): a 5th tab, "Promo Codes", appended after Customers.
- **`AdminPromoCodesPage.jsx`** (new, `/admin/promo-codes`): a plain table (code, type + value formatted as "15%" or "$18.00", usage "12 / 100" or "12 / ∞", expires date or "Never", an Active/Inactive badge) with a "New Code" link, no pagination, no search (matching the small-list scope above). Each row links to its edit page.
- **`AdminPromoCodeFormPage.jsx`** (new, `/admin/promo-codes/new` and `/admin/promo-codes/:code/edit`): a form mirroring `AdminProductFormPage.jsx`'s structure exactly (same field/label/input conventions, same delete-with-`window.confirm` pattern on the edit variant, same `ValidationError`/`ConflictError` → 400/409 → inline error handling).

### Customer (`BagPage.jsx`)

Replaces the existing hardcoded block (`discountCents = Math.round(subtotalCents * 0.15)` and the static "Promo (15%)" / "✓ HAPPY2026" rows, neither of which currently has any real input) with:
- A real `<input>` + "Apply" button when no code is applied yet.
- On a successful `POST /api/promo-codes/validate` call, stores `{ code, discount_type, discount_value }` in component state and swaps the input for a "✓ SPRING15" pill with a remove (×) button.
- `discountCents` becomes a derived value: `0` when no code is applied; otherwise recomputed from the *current* `subtotalCents` every render (`percentage` → `Math.round(subtotalCents * discount_value / 100)`, `fixed` → `Math.min(discount_value, subtotalCents)`) — not frozen at the value the server returned at apply-time, so removing an item after applying a percentage code correctly shrinks the discount instead of leaving it stale.
- A failed validation shows the server's specific reason (`not_found`/`inactive`/`expired`/`usage_limit_reached`) as inline text near the input, matching this app's existing `role="alert"` convention.
- Removing the applied code just clears local state — no backend call (there is nothing to "undo" server-side; `usage_count` was already incremented per the Overview's documented tradeoff).

## Error Handling

- `401` via `requireAdminAuth`/`requireCustomerAuth` on their respective endpoints; admin frontend calls `logout()` on `401` matching every other admin page; `BagPage.jsx` already sits behind customer auth, so a `401` here would only happen if the session expired mid-visit — same handling as its existing product-fetch `401` path.
- `400`/`409` from admin create/update surfaced inline, matching `AdminProductFormPage.jsx`'s existing pattern exactly.
- `404`/`400` with a `reason` field from the validate endpoint, mapped to a specific customer-facing message client-side (not a raw server string).
- `429` from `promoLimiter`, surfaced the same generic way `chatLimiter`/`ordersLimiter` already are.

## Testing

Following the established conventions:

- `adminPromoCodeService`: create/update validation (missing fields, invalid `discount_type`, percentage `> 100`, non-positive `usage_limit`/`discount_value`, invalid `expires_at`), duplicate-code `409` mapping, update-merges-with-existing-row correctness, delete returns `false` for an unknown code.
- `promoCodeService`: each of the four failure reasons in isolation, successful validation's `discount_cents` math for both `percentage` and `fixed` (including the fixed-amount-capped-at-subtotal case), the guarded `usage_count` increment (a code at exactly its `usage_limit` boundary rejects the next attempt), case-insensitive code matching.
- Routes: `401`/`404`/`400`/`409`/`429` status codes across both route files, admin CRUD round-trip.
- Frontend: `AdminPromoCodesPage` renders the list with formatted type/usage/expiry; `AdminPromoCodeFormPage` create/edit/delete flows mirroring `AdminProductFormPage.test.jsx`; `BagPage` — applying a valid code updates the discount row and pill, a failed apply shows the right reason-specific message, removing an applied code clears it and restores the input, the discount recomputes correctly when cart contents change after a percentage code is applied.

## Out of Scope

- Anything wired into `CheckoutPage.jsx` — that page has no real backend behind it at all (see Overview).
- Per-customer usage tracking or one-code-per-customer limits — `usage_limit` is a single global counter, not scoped per customer.
- Stacking multiple codes, category/product-specific codes, minimum-order-value rules, or auto-applied codes — a single code, applied manually, store-wide.
- Any UI resembling the Orders/Products dark reskin — this admin page uses the theme-adaptive palette.
- KPI Dashboard revenue figures reflecting discounts applied via this system — `adminDashboardService.js`'s revenue math is unchanged by this project (out of scope to touch).
- Return & Refund (RMA) Processing — the third, separate Phase 3 sub-project.
