-- Up Migration

-- 35 more orders for lindenbrien27@gmail.com (the app owner's own real
-- inbox, see migrations/1785245334753_add-lindenbrien-seed-orders.sql),
-- spanning January 2025 through July 2026 - enough real history for the
-- new Order Volume widget's Last Month/This Year/Last Year views to each
-- have something genuine to chart, instead of the 2-order account this
-- otherwise still is.
--
-- Every status here is chosen for date plausibility relative to "today"
-- (2026-07-30) - orders placed months ago are 'delivered' (or, twice,
-- 'cancelled'); only the two most recent ones (mid-to-late July 2026) are
-- still 'out_for_delivery'/'processing'. estimated_delivery is always in
-- the future for those two still-in-flight orders and always unset for
-- the two cancelled ones, matching the existing stale-estimate fix in
-- migrations/1785068947495_fix-seed-order-dates.sql.
INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery,
   created_at, unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents, voucher_code, product_icon)
VALUES
  ('ORD-2001', 'lindenbrien27@gmail.com', 'Wireless Noise-Cancelling Headphones', 'delivered', 'UPS', '1Z999AA10300001', '2025-01-20', '2025-01-14T09:30:00Z', 14999, 599, 1200, 0, NULL, 'headphones'),
  ('ORD-2002', 'lindenbrien27@gmail.com', 'USB-C Charging Cable (3-pack)', 'delivered', 'USPS', '9400111899800002', '2025-02-15', '2025-02-09T11:00:00Z', 1999, 0, 160, 0, NULL, 'cable'),
  ('ORD-2003', 'lindenbrien27@gmail.com', 'Compact 65% Mechanical Keyboard', 'delivered', 'FedEx', '789012341003', '2025-03-11', '2025-03-05T14:20:00Z', 8999, 799, 720, 0, NULL, 'keyboard'),
  ('ORD-2004', 'lindenbrien27@gmail.com', 'Ergonomic Office Chair', 'delivered', 'UPS', '1Z999AA10300004', '2025-03-27', '2025-03-21T10:15:00Z', 24999, 1999, 2000, 0, NULL, 'chair'),
  ('ORD-2005', 'lindenbrien27@gmail.com', '27" 4K Monitor', 'cancelled', NULL, NULL, NULL, '2025-04-11T16:00:00Z', 32999, 999, 2640, 0, NULL, 'monitor'),
  ('ORD-2006', 'lindenbrien27@gmail.com', 'Bluetooth Earbuds Pro', 'delivered', 'FedEx', '789012341006', '2025-05-08', '2025-05-02T09:45:00Z', 12999, 599, 1040, 0, NULL, 'headphones'),
  ('ORD-2007', 'lindenbrien27@gmail.com', 'HDMI 2.1 Cable 6ft', 'delivered', 'UPS', '1Z999AA10300007', '2025-05-25', '2025-05-19T13:10:00Z', 1499, 0, 120, 0, NULL, 'cable'),
  ('ORD-2008', 'lindenbrien27@gmail.com', 'Wireless Ergonomic Mouse', 'delivered', 'USPS', '9400111899800008', '2025-06-30', '2025-06-24T10:00:00Z', 4999, 799, 400, 0, NULL, 'keyboard'),
  ('ORD-2009', 'lindenbrien27@gmail.com', 'Standing Desk Converter', 'delivered', 'FedEx', '789012341009', '2025-07-14', '2025-07-08T15:30:00Z', 19999, 1999, 1600, 0, NULL, 'chair'),
  ('ORD-2010', 'lindenbrien27@gmail.com', '34" Ultrawide Curved Monitor', 'cancelled', NULL, NULL, NULL, '2025-07-27T14:00:00Z', 39999, 999, 3200, 0, NULL, 'monitor'),
  ('ORD-2011', 'lindenbrien27@gmail.com', 'Over-Ear Studio Headphones', 'delivered', 'USPS', '9400111899800011', '2025-08-09', '2025-08-03T09:00:00Z', 17999, 599, 1440, 0, NULL, 'headphones'),
  ('ORD-2012', 'lindenbrien27@gmail.com', 'USB-C to Lightning Cable', 'delivered', 'FedEx', '789012341012', '2025-08-22', '2025-08-16T11:40:00Z', 1299, 0, 104, 0, NULL, 'cable'),
  ('ORD-2013', 'lindenbrien27@gmail.com', 'Full-Size Mechanical Keyboard', 'delivered', 'UPS', '1Z999AA10300013', '2025-09-26', '2025-09-20T16:15:00Z', 10999, 799, 880, 0, NULL, 'keyboard'),
  ('ORD-2014', 'lindenbrien27@gmail.com', 'Mesh Back Office Chair', 'delivered', 'USPS', '9400111899800014', '2025-10-11', '2025-10-05T10:30:00Z', 21999, 1999, 1760, 0, NULL, 'chair'),
  ('ORD-2015', 'lindenbrien27@gmail.com', '24" Full HD Monitor', 'delivered', 'FedEx', '789012341015', '2025-10-28', '2025-10-22T13:00:00Z', 15999, 999, 1280, 0, NULL, 'monitor'),
  ('ORD-2016', 'lindenbrien27@gmail.com', 'On-Ear Travel Headphones', 'delivered', 'UPS', '1Z999AA10300016', '2025-11-08', '2025-11-02T09:05:00Z', 8999, 599, 720, 0, NULL, 'headphones'),
  ('ORD-2017', 'lindenbrien27@gmail.com', 'Braided USB-A Cable', 'delivered', 'USPS', '9400111899800017', '2025-11-20', '2025-11-14T12:20:00Z', 999, 0, 80, 0, NULL, 'cable'),
  ('ORD-2018', 'lindenbrien27@gmail.com', 'Wireless Trackpad', 'delivered', 'FedEx', '789012341018', '2025-12-04', '2025-11-28T15:00:00Z', 6999, 799, 560, 0, NULL, 'keyboard'),
  ('ORD-2019', 'lindenbrien27@gmail.com', 'Adjustable Monitor Arm', 'delivered', 'UPS', '1Z999AA10300019', '2025-12-12', '2025-12-06T10:45:00Z', 6999, 1999, 560, 0, NULL, 'chair'),
  ('ORD-2020', 'lindenbrien27@gmail.com', 'Portable USB-C Monitor 15.6"', 'delivered', 'USPS', '9400111899800020', '2025-12-21', '2025-12-15T14:30:00Z', 22999, 999, 1840, 0, NULL, 'monitor'),
  ('ORD-2021', 'lindenbrien27@gmail.com', 'True Wireless Earbuds', 'delivered', 'FedEx', '789012341021', '2025-12-29', '2025-12-23T09:15:00Z', 9999, 599, 800, 0, NULL, 'headphones'),
  ('ORD-2022', 'lindenbrien27@gmail.com', 'DisplayPort Cable 10ft', 'delivered', 'UPS', '1Z999AA10300022', '2026-01-15', '2026-01-09T11:00:00Z', 1799, 0, 144, 0, NULL, 'cable'),
  ('ORD-2023', 'lindenbrien27@gmail.com', 'Gaming Mouse Pad XL', 'delivered', 'USPS', '9400111899800023', '2026-01-31', '2026-01-25T16:00:00Z', 2499, 799, 200, 0, NULL, 'keyboard'),
  ('ORD-2024', 'lindenbrien27@gmail.com', 'Under-Desk Footrest', 'delivered', 'FedEx', '789012341024', '2026-02-19', '2026-02-13T10:00:00Z', 3999, 1999, 320, 0, NULL, 'chair'),
  ('ORD-2025', 'lindenbrien27@gmail.com', 'Dual Monitor Stand', 'delivered', 'UPS', '1Z999AA10300025', '2026-03-10', '2026-03-04T13:20:00Z', 8999, 999, 720, 0, NULL, 'monitor'),
  ('ORD-2026', 'lindenbrien27@gmail.com', 'True Wireless Sport Earbuds', 'delivered', 'USPS', '9400111899800026', '2026-03-25', '2026-03-19T09:30:00Z', 11999, 599, 960, 0, NULL, 'headphones'),
  ('ORD-2027', 'lindenbrien27@gmail.com', 'Ethernet Cable Cat6 25ft', 'delivered', 'FedEx', '789012341027', '2026-04-14', '2026-04-08T12:00:00Z', 1599, 0, 128, 0, NULL, 'cable'),
  ('ORD-2028', 'lindenbrien27@gmail.com', 'Bluetooth Numpad', 'delivered', 'UPS', '1Z999AA10300028', '2026-04-27', '2026-04-21T15:45:00Z', 2999, 799, 240, 0, NULL, 'keyboard'),
  ('ORD-2029', 'lindenbrien27@gmail.com', 'Executive Leather Chair', 'delivered', 'USPS', '9400111899800029', '2026-05-21', '2026-05-15T10:00:00Z', 34999, 1999, 2800, 0, NULL, 'chair'),
  ('ORD-2030', 'lindenbrien27@gmail.com', '32" 4K HDR Monitor', 'delivered', 'FedEx', '789012341030', '2026-06-09', '2026-06-03T11:15:00Z', 42999, 999, 3440, 0, NULL, 'monitor'),
  ('ORD-2031', 'lindenbrien27@gmail.com', 'Studio Monitor Headphones', 'delivered', 'UPS', '1Z999AA10300031', '2026-06-20', '2026-06-14T09:00:00Z', 19999, 599, 1600, 0, NULL, 'headphones'),
  ('ORD-2032', 'lindenbrien27@gmail.com', 'USB-C Hub Adapter', 'delivered', 'USPS', '9400111899800032', '2026-07-03', '2026-06-27T14:10:00Z', 3999, 0, 320, 0, NULL, 'cable'),
  ('ORD-2033', 'lindenbrien27@gmail.com', 'Low-Profile Wireless Keyboard', 'delivered', 'FedEx', '789012341033', '2026-07-11', '2026-07-05T10:30:00Z', 7999, 799, 640, 0, NULL, 'keyboard'),
  ('ORD-2034', 'lindenbrien27@gmail.com', 'Desk Cable Organizer Tray', 'out_for_delivery', 'UPS', '1Z999AA10300034', '2026-08-01', '2026-07-18T15:40:00Z', 1999, 1999, 160, 0, NULL, 'chair'),
  ('ORD-2035', 'lindenbrien27@gmail.com', 'Monitor Privacy Screen', 'processing', NULL, NULL, '2026-08-05', '2026-07-26T13:00:00Z', 3999, 999, 320, 0, NULL, 'monitor')
ON CONFLICT (order_number) DO NOTHING;

-- Down Migration

DELETE FROM orders WHERE order_number LIKE 'ORD-20%';