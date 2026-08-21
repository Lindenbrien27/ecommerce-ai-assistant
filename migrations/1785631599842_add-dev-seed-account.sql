

INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery,
   created_at, unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents, voucher_code, product_icon)
VALUES
  ('ORD-1008', 'dev@example.com', 'Wireless Noise-Cancelling Headphones', 'delivered', 'UPS', '1Z999AA10298765433',
   (now() - interval '2 days')::date::text, now() - interval '4 days', 14999, 599, 1200, 0, NULL, 'headphones'),
  ('ORD-1009', 'dev@example.com', 'USB-C Charging Cable (3-pack)', 'delivered', 'USPS', '9400111899223197428411',
   (now() - interval '5 days')::date::text, now() - interval '7 days', 1999, 0, 160, 200, 'WELCOME10', 'cable')
ON CONFLICT (order_number) DO NOTHING;

DELETE FROM orders WHERE order_number IN ('ORD-1008', 'ORD-1009');
