-- Up Migration

-- Supports keyset pagination on GET /api/orders: ORDER BY created_at DESC, id
-- DESC filtered by customer_email. Without this the existing single-column
-- customer_email index still has to sort every matching row on each page
-- request instead of walking the index in already-sorted order.
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_created_at_id
  ON orders (customer_email, created_at DESC, id DESC);

-- The old single-column index is now a strict prefix of the composite one
-- above, so Postgres can use the composite index for plain customer_email
-- lookups too - keeping both would just be extra write-time maintenance
-- for no read benefit.
DROP INDEX IF EXISTS idx_orders_customer_email;

-- Down Migration

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);

DROP INDEX IF EXISTS idx_orders_customer_email_created_at_id;
