# Basic Product Catalog — Design

## Overview

The prerequisite for `components.md`'s Phase 2 "Product Variants & Inventory Guard" line, and the still-unbuilt "Basic Product Management" sub-project from Phase 1. This app currently has no product/inventory backend at all — `frontend/src/data/shopProducts.js`'s own comment says so outright: static frontend JS objects, no table, no API. The cart is equally fake (`CartContext.jsx`: "no backend-fetched cart exists... this is in-memory only"). Building real variants, stock, or cart-stock locking on top of nothing was not possible, so this project builds the foundation: a real `products` table, admin CRUD to manage it, and the storefront (`ShopPage`, `ProductDetailPage`, `BagPage`, `WishlistPage`) wired to read from it instead of static data.

Two real gaps grounded this design against the actual code, not assumption:

- **No pagination need exists yet.** The current UI already loads the full static catalog into memory for client-side category filtering/sorting — there's no reason to add pagination machinery a 6-product catalog doesn't need. `GET /api/products` returns everything.
- **`orders.product_icon` already uses the exact string identifiers** this new table's `slug` will use (`'headphones'`, `'keyboard'`, etc. — see `migrations/1785095226496_add-order-pricing-and-product-icon.sql`). The seed migration reuses these values so the new table lines up with data that already exists, rather than inventing a parallel id scheme.

## Architecture

A public read side and an admin-gated write side, mirroring the existing customer/admin split already established for orders and customers (`orderService.js`/`adminOrderService.js`, `adminCustomerService.js`):

```
src/services/productService.js        → getProducts(), getProductBySlug(slug)          (public)
src/services/adminProductService.js   → createProduct(), updateProduct(), deleteProduct() (admin)
src/controllers/productController.js
src/controllers/adminProductController.js
src/routes/productRoutes.js           → mounted at /api/products, no auth
src/routes/adminProductRoutes.js      → mounted at /api/admin/products, requireAdminAuth

frontend/src/context/ProductsContext.jsx      → ProductsProvider/useProducts, mirrors OrdersContext
frontend/src/pages/ShopPage.jsx               → existing, converted from static import to context
frontend/src/pages/ProductDetailPage.jsx      → existing, converted
frontend/src/pages/BagPage.jsx                → existing, its findProduct() converted
frontend/src/pages/WishlistPage.jsx           → existing, its findProduct() converted
frontend/src/pages/AdminProductsPage.jsx      → new, /admin/products
frontend/src/pages/AdminProductFormPage.jsx   → new, /admin/products/new and /admin/products/:slug/edit
frontend/src/components/AdminNav.jsx          → existing, gains a third "Products" tab
```

`slug` (not a numeric id) is the product's identifier end-to-end — `slug TEXT PRIMARY KEY`, matching the existing `customer_profiles` table's precedent of a non-numeric primary key, and matching how the frontend already uses string ids (`/shop/:productId`).

## Data Model

```sql
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
```

- `original_price_cents` nullable — a discount display field, matches `orders.voucher_cents`'s "absent means no discount" convention.
- `cover_image_url` is an admin-entered URL, not a file upload — no file-storage subsystem in this pass (that's a separate, bigger addition if ever needed).
- `icon` is the fallback rendering key (`icons.jsx`'s `PRODUCT_ICONS`) used when `cover_image_url` is absent — mirrors `ProductImage.jsx`'s existing fallback behavior exactly, just sourced from a real column instead of a hardcoded prop.
- `colorways` (JSONB array of `{ id, label, hex }`) is decorative display only in this pass — no per-colorway stock. Per-variant stock is the next sub-project (Product Variants), explicitly deferred.
- `stock_quantity` is a single number per product (not per-variant) — matches Phase 1's own literal wording ("Stock quantity counter"), not the variant-level inventory the later sub-project will add.

A backfill migration seeds the 6 products currently in `shopProducts.js` verbatim (slug, name, description, category, price_cents, original_price_cents, colorways — nothing invented there) plus:
- `sku`: a real, plausible SKU per product (doesn't exist in the static data today — new, clearly-flagged fabricated-but-consistent content, the same standard this app already holds itself to for order seed data).
- `stock_quantity`: a real, plausible positive integer per product (same standard).
- `cover_image_url`: `ProductImage.jsx`'s existing `PRODUCT_PHOTOS` map value where one exists (5 of 6 products have a real local photo already); `NULL` for `cloud-shift-runner` (no real photo exists for it today, and this migration doesn't fabricate one).
- `icon`: the existing icon key from `shopProducts.js` (`'headphones'`, `'sneaker'`, etc.).

## Backend Endpoints

**Public — no auth, mounted at `/api/products`:**
- `GET /api/products` — every product, no pagination.
- `GET /api/products/:slug` — one product. `404` if unknown.

**Admin — `requireAdminAuth`, mounted at `/api/admin/products`:**
- `POST /api/admin/products` — create. Body: `{ slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways }` (`slug`, `name`, `category`, `price_cents`, `sku` required; everything else optional/nullable with sensible defaults). `400` on missing/invalid required fields, `409` if `slug` or `sku` already exists.
- `PATCH /api/admin/products/:slug` — update any subset of the same fields. `404` if unknown, `400`/`409` same as create (a `409` on `PATCH` only applies if the update tries to change `sku` to one already used by a different product — changing an existing product's own fields, including `slug`'s corresponding row, must not 409 against itself).
- `DELETE /api/admin/products/:slug` — delete. `404` if unknown.

No draft/unpublished state — every row is immediately live in the storefront (YAGNI; nothing in this app has that concept today, and it isn't part of what was asked for).

## Frontend

**`ProductsContext.jsx`** (new): `ProductsProvider` fetches `GET /api/products` once on mount, exposes `{ products, loading, error }` via `useProducts()`. Mounted inside `Layout.jsx` alongside the existing `OrdersProvider`/`CartProvider`, so every customer-facing page under it shares one fetch instead of each re-fetching independently.

**Existing pages, converted from the static `SHOP_PRODUCTS` import to `useProducts()`:**
- `ShopPage.jsx` — category list and grid derive from live `products` instead of the static array; gains loading/error states (static data couldn't fail or take time, so none existed before).
- `ProductDetailPage.jsx` — looks up by `slug` from context instead of `SHOP_PRODUCTS.find(...)`. `PRODUCT_DETAILS` (ratings/reviews/specs) is untouched — that's already-established fabricated promotional content, unrelated to catalog/stock data, out of scope here.
- `BagPage.jsx`, `WishlistPage.jsx` — their existing `findProduct(productId)` helpers read from `useProducts()` instead of `SHOP_PRODUCTS.find(...)`. The cart/wishlist item lists themselves (which products are in the bag/wishlist) stay exactly as fabricated/local as today — only the product *lookup* becomes real. Real cart persistence remains separate, unbuilt work.

**New admin pages**, added as a third `AdminNav` tab ("Products"), alongside the existing Orders/Customers tabs:
- `AdminProductsPage.jsx` (`/admin/products`) — table (name, SKU, price, stock, category), reusing the public `GET /api/products` list (no separate admin-only listing endpoint needed), with a "New Product" link.
- `AdminProductFormPage.jsx` — one component handling both create (`/admin/products/new`, no initial data) and edit (`/admin/products/:slug/edit`, pre-filled from `GET /api/products/:slug`), plus a delete button with confirmation on the edit form.

## Error Handling

- `404` for an unknown `slug` on `GET /api/products/:slug`, `PATCH`, and `DELETE`.
- `400` for missing/invalid required fields on create, or an invalid `price_cents`/`stock_quantity` (non-integer or negative) on either create or update.
- `409` for a `slug` or `sku` collision, distinguishing which field collided in the error message.
- `401` via `requireAdminAuth` on all three admin endpoints; frontend admin pages call `logout()` on 401, matching the existing convention.
- `ProductDetailPage.jsx` shows a not-found state (mirroring its existing `Navigate` fallback for an unmatched `productId`) when the API 404s.
- `ShopPage.jsx`/admin pages surface fetch failures inline (`role="alert"`), matching every other page in this app.

## Testing

Following this codebase's established conventions:

- `productService`/`adminProductService`: service-level tests mocking `pool.query` directly — `getProducts` returns all rows, `getProductBySlug` returns `null` for unknown, `createProduct`/`updateProduct` reject missing required fields and surface unique-constraint violations as a distinguishable error the controller can map to `409`, `deleteProduct` returns whether a row was actually deleted.
- Route-level tests (`test/products.test.js`, `test/adminProducts.test.js`) via the established `withServer` pattern: public endpoints reachable with no auth, admin endpoints `401` without a cookie, full CRUD round-trip (`create` → `200`/`201`, duplicate `slug`/`sku` → `409`, `update` → reflects changes, `delete` → subsequent `GET` `404`s).
- Frontend: `ProductsContext` tests (fetch-once behavior, `loading`/`error` states); updated/new tests for `ShopPage`, `ProductDetailPage`, `BagPage`, `WishlistPage` confirming they render real fetched data instead of static imports (none of these four pages currently has a test file — this project adds baseline coverage for the data-source change, not a full UI-interaction test suite for behavior this project didn't touch); `AdminProductsPage`/`AdminProductFormPage` tests following the exact pattern already established for `AdminOrdersPage`/`AdminOrderDetailPage` (render from a mocked fetch, form submission, delete confirmation, 401 handling).

## Out of Scope

- Per-variant stock (colorway/size-level inventory) and low-stock warnings — the next sub-project in this roadmap line, deferred explicitly.
- A real, backend-synced cart / stock reservations or locks — a separate, still-unbuilt project (today's cart is entirely local/in-memory; this project only makes the *products it references* real).
- File upload for `cover_image_url` — URL field only.
- Draft/unpublished products, product categories as a managed entity (category is a free-text field on each product, not its own table) — neither was asked for.
- `PRODUCT_DETAILS` (ratings/reviews/specs) and `CheckoutPage.jsx` — both remain exactly as fabricated/untouched as they are today, unrelated to this project's scope.
