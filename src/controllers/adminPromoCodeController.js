const adminPromoCodeService = require('../services/adminPromoCodeService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const WRITABLE_FIELDS = ['code', 'discount_type', 'discount_value', 'usage_limit', 'expires_at', 'active'];

function fieldsFromBody(body) {
  const fields = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
}

async function listPromoCodes(req, res) {
  try {
    const codes = await adminPromoCodeService.getPromoCodes();
    res.json(codes);
  } catch (err) {
    logError('Admin promo code list error', err);
    res.status(500).json({ error: 'Something went wrong looking up promo codes.' });
  }
}

async function createPromoCode(req, res) {
  try {
    const code = await adminPromoCodeService.createPromoCode(fieldsFromBody(req.body));
    auditLog('admin.promo_code.created', { code: code.code, admin: req.adminEmail });
    res.status(201).json(code);
  } catch (err) {
    if (err instanceof adminPromoCodeService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminPromoCodeService.ConflictError) {
      return res.status(409).json({ error: 'code already exists.' });
    }
    logError('Admin promo code create error', err);
    res.status(500).json({ error: 'Something went wrong creating that promo code.' });
  }
}

async function updatePromoCode(req, res) {
  try {
    const code = await adminPromoCodeService.updatePromoCode(req.params.code, fieldsFromBody(req.body));
    if (!code) {
      return res.status(404).json({ error: 'Promo code not found' });
    }
    auditLog('admin.promo_code.updated', { code: req.params.code, admin: req.adminEmail });
    res.json(code);
  } catch (err) {
    if (err instanceof adminPromoCodeService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminPromoCodeService.ConflictError) {
      return res.status(409).json({ error: 'code already exists.' });
    }
    logError('Admin promo code update error', err);
    res.status(500).json({ error: 'Something went wrong updating that promo code.' });
  }
}

async function deletePromoCode(req, res) {
  try {
    const deleted = await adminPromoCodeService.deletePromoCode(req.params.code);
    if (!deleted) {
      return res.status(404).json({ error: 'Promo code not found' });
    }
    auditLog('admin.promo_code.deleted', { code: req.params.code, admin: req.adminEmail });
    res.json({ ok: true });
  } catch (err) {
    logError('Admin promo code delete error', err);
    res.status(500).json({ error: 'Something went wrong deleting that promo code.' });
  }
}

module.exports = { listPromoCodes, createPromoCode, updatePromoCode, deletePromoCode };
