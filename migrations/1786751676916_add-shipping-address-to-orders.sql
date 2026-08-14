-- Up Migration

-- Packing slips and invoices need a real ship-to address, and none exists
-- anywhere yet (not on orders, not collected at checkout - see the design
-- spec's own finding). recipient_name is separate from customer_email/
-- customer_profiles.name since a shipment's recipient can differ from the
-- account holder (an office, a gift recipient). Nullable, matching how
-- carrier/tracking_number are already nullable on this table - an order
-- can exist before it has shipping info.
ALTER TABLE orders
  ADD COLUMN recipient_name TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN postal_code TEXT,
  ADD COLUMN country TEXT;

-- Down Migration

ALTER TABLE orders
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS country;