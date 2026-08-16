-- Up Migration

-- Supports keyset pagination on GET /api/admin/orders: ORDER BY created_at
-- DESC, id DESC with no customer_email filter (admin sees all customers'
-- orders, unlike the customer-scoped idx_orders_customer_email_created_at_id
-- index, whose leading column makes it useless here). Without this, every
-- admin order-list/filter/search/page request does a full sequential scan
-- and sort of the entire orders table.
CREATE INDEX IF NOT EXISTS idx_orders_created_at_id
  ON orders (created_at DESC, id DESC);

-- Down Migration

DROP INDEX IF EXISTS idx_orders_created_at_id;
