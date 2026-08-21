

CREATE INDEX IF NOT EXISTS idx_orders_created_at_id
  ON orders (created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_orders_created_at_id;
