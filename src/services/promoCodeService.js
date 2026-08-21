const { pool } = require('../config/db');

function computeDiscountCents(discountType, discountValue, subtotalCents) {
  if (discountType === 'percentage') {
    return Math.round((subtotalCents * discountValue) / 100);
  }
  return Math.min(discountValue, subtotalCents);
}

async function validateAndApplyPromoCode(rawCode, subtotalCents) {
  const code = rawCode.trim().toUpperCase();

  const { rows } = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
  const promo = rows[0];

  if (!promo) return { ok: false, reason: 'not_found' };
  if (!promo.active) return { ok: false, reason: 'inactive' };

  if (promo.expires_at && new Date(promo.expires_at) <= new Date()) {
    return { ok: false, reason: 'expired' };
  }
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) {
    return { ok: false, reason: 'usage_limit_reached' };
  }

  const updateResult = await pool.query(
    `UPDATE promo_codes SET usage_count = usage_count + 1
     WHERE code = $1 AND usage_count < COALESCE(usage_limit, usage_count + 1)
     RETURNING *`,
    [code]
  );

  if (updateResult.rows.length === 0) {
    return { ok: false, reason: 'usage_limit_reached' };
  }

  return {
    ok: true,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_cents: computeDiscountCents(promo.discount_type, promo.discount_value, subtotalCents),
  };
}

module.exports = { validateAndApplyPromoCode };
