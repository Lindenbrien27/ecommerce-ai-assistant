-- Up Migration

-- code is the primary key, always stored uppercase (normalized in
-- promoCodeService.js/adminPromoCodeService.js before every write) - every
-- lookup is then a plain equality check, never ILIKE/UPPER() on read.
-- discount_value is a whole integer: 1-100 for 'percentage', cents for
-- 'fixed' - same cents convention every other money column in this schema
-- already uses. usage_limit NULL means unlimited; usage_count only
-- increments on a successful customer-facing validate call, since this
-- app has no live order-placement flow to hook a "real purchase" event
-- into (see docs/superpowers/specs/2026-08-16-promo-code-engine-design.md).
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

-- Down Migration

DROP TABLE IF EXISTS promo_codes;
