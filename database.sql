CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled')),
  carrier TEXT,
  tracking_number TEXT,
  estimated_delivery TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);

INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery)
VALUES
  ('ORD-1001', 'jane.doe@example.com', 'Wireless Noise-Cancelling Headphones', 'shipped', 'UPS', '1Z999AA10123456784', '2026-07-28'),
  ('ORD-1002', 'jane.doe@example.com', 'USB-C Charging Cable (3-pack)', 'delivered', 'USPS', '9400111899223197428490', '2026-07-20'),
  ('ORD-1003', 'john.smith@example.com', 'Mechanical Keyboard', 'processing', NULL, NULL, '2026-08-02'),
  ('ORD-1004', 'john.smith@example.com', 'Ergonomic Office Chair', 'out_for_delivery', 'FedEx', '789012345678', '2026-07-25'),
  ('ORD-1005', 'ada.lovelace@example.com', '27" 4K Monitor', 'cancelled', NULL, NULL, NULL)
ON CONFLICT (order_number) DO NOTHING;
