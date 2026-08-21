

ALTER TABLE orders
  ADD COLUMN refund_amount_cents INTEGER,
  ADD COLUMN refund_reason TEXT,
  ADD COLUMN restocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN refunded_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'));

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'));

ALTER TABLE orders
  DROP COLUMN refund_amount_cents,
  DROP COLUMN refund_reason,
  DROP COLUMN restocked,
  DROP COLUMN refunded_at;
