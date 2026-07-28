-- Up Migration

-- A real customer's own email (lindenbrien27@gmail.com), not another
-- example.com placeholder - so logging in with it lands on a populated
-- dashboard instead of the honest-but-empty state every other real email
-- already gets (see TEST_ACCOUNTS.md). Same shape as the initial seed:
-- one still-in-transit order and one already-delivered one, so both the
-- "On Shipping" and "Arrived" status filters and the order-progress
-- stepper have something real to show. product_icon values are the same
-- five ProductImage.jsx has real photos for (see
-- migrations/1785095226496_add-order-pricing-and-product-icon.sql) -
-- reusing 'monitor'/'keyboard' rather than inventing a sixth category
-- that would fall back to the plain icon tile instead of a photo.
INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery,
   created_at, unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents, voucher_code, product_icon)
VALUES
  ('ORD-1006', 'lindenbrien27@gmail.com', '34" Ultrawide Curved Monitor', 'shipped', 'UPS', '1Z999AA10198765432', '2026-07-30',
   '2026-07-24T13:20:00Z', 39999, 1499, 3200, 0, NULL, 'monitor'),
  ('ORD-1007', 'lindenbrien27@gmail.com', 'Compact 65% Mechanical Keyboard', 'delivered', 'FedEx', '789012345690', '2026-07-16',
   '2026-07-10T09:45:00Z', 12999, 0, 1040, 1000, 'SAVE10', 'keyboard')
ON CONFLICT (order_number) DO NOTHING;

-- Down Migration

DELETE FROM orders WHERE order_number IN ('ORD-1006', 'ORD-1007');
