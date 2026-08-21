

DROP TABLE IF EXISTS customer_payment_methods;
DROP TABLE IF EXISTS customer_addresses;

CREATE TABLE IF NOT EXISTS customer_addresses (
  email TEXT PRIMARY KEY,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL,
  phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_payment_methods (
  email TEXT PRIMARY KEY,
  brand TEXT NOT NULL CHECK (brand IN ('Visa', 'Mastercard', 'Amex', 'Discover')),
  last4 TEXT NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  expiry_month INT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year INT NOT NULL,
  billing_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
