

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

DROP TABLE IF EXISTS products;
