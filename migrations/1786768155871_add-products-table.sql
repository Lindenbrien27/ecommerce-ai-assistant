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