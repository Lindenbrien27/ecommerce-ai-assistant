-- Up Migration

-- Cents, not decimal - the standard way to avoid floating-point rounding
-- errors on money (e.g. 19.99 + 0.01 not reliably landing on exactly
-- 20.00 in binary floating point). voucher_cents is a positive amount
-- subtracted at display time, not stored negative, so "no voucher" is
-- unambiguously 0 rather than relying on a sign convention.
ALTER TABLE orders
  ADD COLUMN unit_price_cents INTEGER,
  ADD COLUMN delivery_cost_cents INTEGER,
  ADD COLUMN vat_cents INTEGER,
  ADD COLUMN voucher_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN voucher_code TEXT,
  ADD COLUMN product_icon TEXT;

-- product_icon is a stable identifier (matched to one of a handful of
-- hand-drawn SVGs in frontend/src/components/icons.jsx), not derived from
-- product_name - free-text product names shouldn't have to double as a
-- lookup key for which icon to render.
UPDATE orders SET
  unit_price_cents = 14999, delivery_cost_cents = 599, vat_cents = 1200, voucher_cents = 0, voucher_code = NULL, product_icon = 'headphones'
  WHERE order_number = 'ORD-1001';
UPDATE orders SET
  unit_price_cents = 1999, delivery_cost_cents = 0, vat_cents = 160, voucher_cents = 200, voucher_code = 'WELCOME10', product_icon = 'cable'
  WHERE order_number = 'ORD-1002';
UPDATE orders SET
  unit_price_cents = 8999, delivery_cost_cents = 799, vat_cents = 720, voucher_cents = 0, voucher_code = NULL, product_icon = 'keyboard'
  WHERE order_number = 'ORD-1003';
UPDATE orders SET
  unit_price_cents = 24999, delivery_cost_cents = 1999, vat_cents = 2000, voucher_cents = 2000, voucher_code = 'SAVE20', product_icon = 'chair'
  WHERE order_number = 'ORD-1004';
UPDATE orders SET
  unit_price_cents = 32999, delivery_cost_cents = 999, vat_cents = 2640, voucher_cents = 0, voucher_code = NULL, product_icon = 'monitor'
  WHERE order_number = 'ORD-1005';

-- Down Migration

ALTER TABLE orders
  DROP COLUMN unit_price_cents,
  DROP COLUMN delivery_cost_cents,
  DROP COLUMN vat_cents,
  DROP COLUMN voucher_cents,
  DROP COLUMN voucher_code,
  DROP COLUMN product_icon;
