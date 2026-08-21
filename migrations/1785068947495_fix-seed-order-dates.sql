

UPDATE orders SET created_at = '2026-07-22T09:00:00Z' WHERE order_number = 'ORD-1001';
UPDATE orders SET created_at = '2026-07-14T14:30:00Z' WHERE order_number = 'ORD-1002';
UPDATE orders SET created_at = '2026-07-25T11:15:00Z' WHERE order_number = 'ORD-1003';
UPDATE orders SET created_at = '2026-07-20T16:45:00Z', estimated_delivery = '2026-07-27' WHERE order_number = 'ORD-1004';
UPDATE orders SET created_at = '2026-07-23T10:00:00Z' WHERE order_number = 'ORD-1005';

UPDATE orders SET created_at = DEFAULT WHERE order_number IN ('ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1005');
UPDATE orders SET created_at = DEFAULT, estimated_delivery = '2026-07-25' WHERE order_number = 'ORD-1004';
