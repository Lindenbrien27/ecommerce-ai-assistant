const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminPromoCodeService = require('../src/services/adminPromoCodeService');

const VALID_FIELDS = { code: 'spring15', discount_type: 'percentage', discount_value: 15 };

test('getPromoCodes returns every row ordered by created_at DESC', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /ORDER BY created_at DESC/);
    return { rows: [{ code: 'SPRING15' }, { code: 'OLD10' }] };
  });

  const codes = await adminPromoCodeService.getPromoCodes();
  assert.equal(codes.length, 2);
});

test('createPromoCode rejects a missing required field', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, discount_type: undefined }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode rejects an unrecognized discount_type', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, discount_type: 'bogus' }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode rejects a percentage discount_value over 100', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, discount_value: 150 }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode rejects a non-positive discount_value', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, discount_value: 0 }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode rejects a non-positive usage_limit when provided', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, usage_limit: -1 }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode rejects an invalid expires_at when provided', async (t) => {
  await assert.rejects(
    adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, expires_at: 'not-a-date' }),
    adminPromoCodeService.ValidationError
  );
});

test('createPromoCode uppercases and trims the code before inserting', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[0], 'SPRING15');
    return { rows: [{ code: 'SPRING15', ...VALID_FIELDS }] };
  });

  await adminPromoCodeService.createPromoCode({ ...VALID_FIELDS, code: '  spring15  ' });
});

test('createPromoCode maps a duplicate-code unique violation to ConflictError', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "promo_codes_pkey"');
    err.code = '23505';
    throw err;
  });

  await assert.rejects(adminPromoCodeService.createPromoCode(VALID_FIELDS), adminPromoCodeService.ConflictError);
});

test('updatePromoCode merges provided fields with the existing row and never touches code/usage_count/created_at', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 4, expires_at: null, active: true }],
      };
    }
    assert.doesNotMatch(sql, /usage_count\s*=/);
    assert.doesNotMatch(sql, /code\s*=\s*\$/);
    assert.equal(params[params.length - 1], 'SPRING15'); // WHERE code = $N
    return { rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 20, usage_limit: null, usage_count: 4, expires_at: null, active: true }] };
  });

  const updated = await adminPromoCodeService.updatePromoCode('SPRING15', { discount_value: 20 });
  assert.equal(updated.discount_value, 20);
});

test('updatePromoCode returns null for an unknown code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const updated = await adminPromoCodeService.updatePromoCode('NOPE', { active: false });
  assert.equal(updated, null);
});

test('updatePromoCode rejects an invalid field the same way createPromoCode does', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return { rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 0, expires_at: null, active: true }] };
    }
    return { rows: [] };
  });

  await assert.rejects(
    adminPromoCodeService.updatePromoCode('SPRING15', { discount_value: 999 }),
    adminPromoCodeService.ValidationError
  );
});

test('deletePromoCode returns true when a row was deleted, false otherwise', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ code: 'SPRING15' }] }));
  assert.equal(await adminPromoCodeService.deletePromoCode('SPRING15'), true);
});

test('deletePromoCode returns false for an unknown code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  assert.equal(await adminPromoCodeService.deletePromoCode('NOPE'), false);
});
