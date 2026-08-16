const { pool } = require('../config/db');

function computeDiscountCents(discountType, discountValue, subtotalCents) {
  if (discountType === 'percentage') {
    return Math.round((subtotalCents * discountValue) / 100);
  }
  return Math.min(discountValue, subtotalCents);
}

// The one real "use" event this app has for a promo code - see this
// plan's own Global Constraints and the design spec's Overview for why
// there's no real order-placement flow to hook usage_count into instead.
async function validateAndApplyPromoCode(rawCode, subtotalCents) {
  const code = rawCode.trim().toUpperCase();

  const { rows } = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
  const promo = rows[0];

  // Not-found and inactive deliberately return the identical reason shape
  // to the caller at the HTTP layer (both map to 404) - a disabled code
  // shouldn't be distinguishable from a nonexistent one to a probing
  // client, same enumeration-resistance reasoning otpService.js already
  // documents for its own verify endpoint.
  if (!promo) return { ok: false, reason: 'not_found' };
  if (!promo.active) return { ok: false, reason: 'inactive' };
  // <=, not < - a code whose expires_at is exactly "now" is already
  // expired, not usable through its very last instant.
  if (promo.expires_at && new Date(promo.expires_at) <= new Date()) {
    return { ok: false, reason: 'expired' };
  }
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) {
    return { ok: false, reason: 'usage_limit_reached' };
  }

  // Guarded increment, not a plain UPDATE ... SET usage_count = usage_count
  // + 1 - two concurrent requests against the very last remaining use
  // (usage_count === usage_limit - 1) must not both succeed. The WHERE
  // clause re-checks the limit at UPDATE time, not just the SELECT time
  // read above, so RETURNING having zero rows means this request lost
  // that race even though the earlier SELECT looked fine.
  const updateResult = await pool.query(
    `UPDATE promo_codes SET usage_count = usage_count + 1
     WHERE code = $1 AND usage_count < COALESCE(usage_limit, usage_count + 1)
     RETURNING *`,
    [code]
  );

  if (updateResult.rows.length === 0) {
    return { ok: false, reason: 'usage_limit_reached' };
  }

  // Reads discount_type/discount_value from the earlier SELECT snapshot,
  // not updateResult.rows[0] - those columns are immutable between the two
  // queries here, so either source works today, but only the SELECT one
  // was already validated against (active/expiry/limit checks above).
  return {
    ok: true,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_cents: computeDiscountCents(promo.discount_type, promo.discount_value, subtotalCents),
  };
}

module.exports = { validateAndApplyPromoCode };
