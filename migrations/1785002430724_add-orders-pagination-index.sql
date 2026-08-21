

CREATE INDEX IF NOT EXISTS idx_orders_customer_email_created_at_id
  ON orders (customer_email, created_at DESC, id DESC);

DROP INDEX IF EXISTS idx_orders_customer_email;

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);

DROP INDEX IF EXISTS idx_orders_customer_email_created_at_id;
