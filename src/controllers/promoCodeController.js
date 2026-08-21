const promoCodeService = require('../services/promoCodeService');
const { logError } = require('../utils/logger');

const FAILURE_STATUS = {
  not_found: 404,
  inactive: 404,
  expired: 400,
  usage_limit_reached: 400,
};

const FAILURE_MESSAGE = {
  not_found: 'That promo code was not found.',
  inactive: 'That promo code was not found.',
  expired: 'That promo code has expired.',
  usage_limit_reached: 'That promo code has reached its usage limit.',
};

async function validate(req, res) {
  const { code, subtotal_cents: subtotalCents } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required.' });
  }
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    return res.status(400).json({ error: 'subtotal_cents must be a non-negative integer.' });
  }

  try {
    const result = await promoCodeService.validateAndApplyPromoCode(code, subtotalCents);
    if (!result.ok) {

      const publicReason = result.reason === 'inactive' ? 'not_found' : result.reason;
      return res.status(FAILURE_STATUS[result.reason]).json({ error: FAILURE_MESSAGE[result.reason], reason: publicReason });
    }
    res.json({
      code: result.code,
      discount_type: result.discount_type,
      discount_value: result.discount_value,
      discount_cents: result.discount_cents,
    });
  } catch (err) {
    logError('Promo code validate error', err);
    res.status(500).json({ error: 'Something went wrong applying that promo code.' });
  }
}

module.exports = { validate };
