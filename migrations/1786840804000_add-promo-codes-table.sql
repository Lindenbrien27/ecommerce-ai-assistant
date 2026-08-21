

CREATE TABLE promo_codes (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS promo_codes;
