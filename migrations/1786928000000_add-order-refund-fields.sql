-- Up Migration

-- refund_amount_cents/refund_reason/restocked/refunded_at are all NULL
-- (restocked defaults false) until a refund is actually processed -
-- refunded_at IS NOT NULL is what "this order has already been refunded"
-- means (see adminOrderService.js's refundOrder). 'returned' joins the
-- status CHECK constraint here at the database level - it's deliberately
-- NOT added to adminOrderService.js's own ORDER_STATUSES allowlist (see
-- that file's own comment), so it's only reachable through the refund
-- endpoint, never the generic status-PATCH dropdown.
ALTER TABLE orders
  ADD COLUMN refund_amount_cents INTEGER,
  ADD COLUMN refund_reason TEXT,
  ADD COLUMN restocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN refunded_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'));

-- Down Migration

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'));

ALTER TABLE orders
  DROP COLUMN refund_amount_cents,
  DROP COLUMN refund_reason,
  DROP COLUMN restocked,
  DROP COLUMN refunded_at;
