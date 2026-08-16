const { pool } = require('../config/db');

const REQUIRED_FIELDS = ['code', 'discount_type', 'discount_value'];
const DISCOUNT_TYPES = Object.freeze(['percentage', 'fixed']);

class ValidationError extends Error {}
class ConflictError extends Error {
  constructor() {
    super('code already exists');
  }
}

function validateFields(fields, { partial } = { partial: false }) {
  if (!partial) {
    for (const key of REQUIRED_FIELDS) {
      if (fields[key] === undefined || fields[key] === null || fields[key] === '') {
        throw new ValidationError(`${key} is required.`);
      }
    }
  }

  if (fields.discount_type !== undefined && !DISCOUNT_TYPES.includes(fields.discount_type)) {
    throw new ValidationError(`discount_type must be one of: ${DISCOUNT_TYPES.join(', ')}`);
  }

  if (fields.discount_value !== undefined) {
    if (!Number.isInteger(fields.discount_value) || fields.discount_value <= 0) {
      throw new ValidationError('discount_value must be a positive integer.');
    }
    const effectiveType = fields.discount_type;
    if (effectiveType === 'percentage' && fields.discount_value > 100) {
      throw new ValidationError('discount_value must be 100 or less for a percentage discount.');
    }
  }

  if (fields.usage_limit !== undefined && fields.usage_limit !== null) {
    if (!Number.isInteger(fields.usage_limit) || fields.usage_limit <= 0) {
      throw new ValidationError('usage_limit must be a positive integer when provided.');
    }
  }

  if (fields.expires_at !== undefined && fields.expires_at !== null) {
    if (Number.isNaN(new Date(fields.expires_at).getTime())) {
      throw new ValidationError('expires_at must be a valid date when provided.');
    }
  }
}

function mapUniqueViolation(err) {
  if (err.code === '23505') return new ConflictError();
  return err;
}

async function getPromoCodes() {
  const { rows } = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
  return rows;
}

async function createPromoCode(fields) {
  validateFields(fields);
  const code = fields.code.trim().toUpperCase();
  try {
    const { rows } = await pool.query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, usage_limit, expires_at, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        code,
        fields.discount_type,
        fields.discount_value,
        fields.usage_limit ?? null,
        fields.expires_at ?? null,
        fields.active ?? true,
      ]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

// Fetches the current row first and merges, same reasoning
// adminProductService.updateProduct's own comment documents: a plain SQL
// UPDATE with unconditional SET clauses would overwrite every unlisted
// field with NULL/undefined. code, usage_count, and created_at are never
// part of the merge - a PATCH changes a code's terms, not its identity or
// its usage history.
async function updatePromoCode(code, fields) {
  validateFields(fields, { partial: true });

  const existing = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
  if (existing.rows.length === 0) return null;
  const current = existing.rows[0];

  // discount_value's percentage-<=100 check needs the *effective* type
  // (the merged one, not just whatever was in this partial request) -
  // re-validate against the merged shape so e.g. patching only
  // discount_value on an existing percentage code still catches a value
  // over 100.
  const merged = {
    discount_type: fields.discount_type ?? current.discount_type,
    discount_value: fields.discount_value ?? current.discount_value,
    usage_limit: fields.usage_limit !== undefined ? fields.usage_limit : current.usage_limit,
    expires_at: fields.expires_at !== undefined ? fields.expires_at : current.expires_at,
    active: fields.active !== undefined ? fields.active : current.active,
  };
  validateFields(merged, { partial: true });

  try {
    const { rows } = await pool.query(
      `UPDATE promo_codes SET
         discount_type = $1, discount_value = $2, usage_limit = $3, expires_at = $4, active = $5
       WHERE code::text = $6
       RETURNING *`,
      [merged.discount_type, merged.discount_value, merged.usage_limit, merged.expires_at, merged.active, code]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

async function deletePromoCode(code) {
  const { rows } = await pool.query('DELETE FROM promo_codes WHERE code = $1 RETURNING code', [code]);
  return rows.length > 0;
}

module.exports = { getPromoCodes, createPromoCode, updatePromoCode, deletePromoCode, ValidationError, ConflictError };
