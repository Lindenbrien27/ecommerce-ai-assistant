

INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery,
   created_at, unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents, voucher_code, product_icon)
VALUES
  ('ORD-1006', 'lindenbrien27@gmail.com', '34" Ultrawide Curved Monitor', 'shipped', 'UPS', '1Z999AA10198765432', '2026-07-30',
   '2026-07-24T13:20:00Z', 39999, 1499, 3200, 0, NULL, 'monitor'),
  ('ORD-1007', 'lindenbrien27@gmail.com', 'Compact 65% Mechanical Keyboard', 'delivered', 'FedEx', '789012345690', '2026-07-16',
   '2026-07-10T09:45:00Z', 12999, 0, 1040, 1000, 'SAVE10', 'keyboard')
ON CONFLICT (order_number) DO NOTHING;

DELETE FROM orders WHERE order_number IN ('ORD-1006', 'ORD-1007');
