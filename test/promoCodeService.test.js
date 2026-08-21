const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const promoCodeService = require('../src/services/promoCodeService');

function futureDate() {
  return new Date(Date.now() + 60 * 60_000).toISOString();
}

function pastDate() {
  return new Date(Date.now() - 60 * 60_000).toISOString();
}

test('validateAndApplyPromoCode returns not_found when no row matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const result = await promoCodeService.validateAndApplyPromoCode('nope', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_found');
});

test('validateAndApplyPromoCode uppercases the code before looking it up', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[0], 'SPRING15');
    return { rows: [] };
  });

  await promoCodeService.validateAndApplyPromoCode('spring15', 10000);
});

test('validateAndApplyPromoCode returns inactive (same shape as not_found) for a disabled code', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 0, expires_at: null, active: false }],
  }));

  const result = await promoCodeService.validateAndApplyPromoCode('SPRING15', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'inactive');
});

test('validateAndApplyPromoCode returns expired for a past expires_at', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ code: 'OLD10', discount_type: 'fixed', discount_value: 1000, usage_limit: null, usage_count: 0, expires_at: pastDate(), active: true }],
  }));

  const result = await promoCodeService.validateAndApplyPromoCode('OLD10', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'expired');
});

test('validateAndApplyPromoCode returns usage_limit_reached when usage_count >= usage_limit', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ code: 'LIMITED', discount_type: 'fixed', discount_value: 500, usage_limit: 3, usage_count: 3, expires_at: null, active: true }],
  }));

  const result = await promoCodeService.validateAndApplyPromoCode('LIMITED', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'usage_limit_reached');
});

test('validateAndApplyPromoCode computes percentage discount and guards the usage_count increment', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 2, expires_at: null, active: true }],
      };
    }

    assert.match(sql, /UPDATE promo_codes SET usage_count = usage_count \+ 1/);
    assert.match(sql, /WHERE code = \$1/);
    assert.match(sql, /usage_count < COALESCE\(usage_limit, usage_count \+ 1\)/);
    return { rows: [{ code: 'SPRING15' }] };
  });

  const result = await promoCodeService.validateAndApplyPromoCode('SPRING15', 10000);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'SPRING15');
  assert.equal(result.discount_type, 'percentage');
  assert.equal(result.discount_value, 15);
  assert.equal(result.discount_cents, 1500);
  assert.equal(query.mock.callCount(), 2);
});

test('validateAndApplyPromoCode succeeds for a code with a future expires_at (not yet expired)', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'SOON', discount_type: 'fixed', discount_value: 500, usage_limit: null, usage_count: 0, expires_at: futureDate(), active: true }],
      };
    }
    return { rows: [{ code: 'SOON' }] };
  });

  const result = await promoCodeService.validateAndApplyPromoCode('SOON', 10000);
  assert.equal(result.ok, true);
  assert.equal(result.discount_cents, 500);
});

test('validateAndApplyPromoCode caps a fixed discount at the subtotal, never going negative', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'BIG20', discount_type: 'fixed', discount_value: 2000, usage_limit: null, usage_count: 0, expires_at: null, active: true }],
      };
    }
    return { rows: [{ code: 'BIG20' }] };
  });

  const result = await promoCodeService.validateAndApplyPromoCode('BIG20', 1500);
  assert.equal(result.ok, true);
  assert.equal(result.discount_cents, 1500);
});

test('validateAndApplyPromoCode returns usage_limit_reached if the guarded UPDATE affects zero rows (lost the race)', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'RACER', discount_type: 'fixed', discount_value: 500, usage_limit: 1, usage_count: 0, expires_at: null, active: true }],
      };
    }

    return { rows: [] };
  });

  const result = await promoCodeService.validateAndApplyPromoCode('RACER', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'usage_limit_reached');
});
