

ALTER TABLE orders
  ADD COLUMN recipient_name TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN postal_code TEXT,
  ADD COLUMN country TEXT;

ALTER TABLE orders
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS country;