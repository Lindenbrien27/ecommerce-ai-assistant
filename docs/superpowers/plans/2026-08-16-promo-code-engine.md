# Discounts & Promo Code Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, admin-managed promo-code system — percentage or fixed-amount codes with usage limits and expiration dates — wired into the one cart page (`BagPage.jsx`) that's actually functional in this app, replacing its hardcoded fake 15%-off/"HAPPY2026" display.

**Architecture:** New `promo_codes` table. Two parallel service/controller/route triads: an admin CRUD triad (mirroring `adminProductService.js` exactly) and a customer-facing single validate-and-apply endpoint (mirroring the `chatLimiter`/`ordersLimiter` customer-auth + rate-limit convention). Two new admin pages (list + form, mirroring `AdminProductsPage.jsx`/`AdminProductFormPage.jsx`) plus a real promo-code UI added to `BagPage.jsx`. Full design rationale: `docs/superpowers/specs/2026-08-16-promo-code-engine-design.md`.

**Tech Stack:** Express + `pg` (`pool.query`), `node-pg-migrate`, React (no new dependencies), `node:test` for backend tests, Vitest + Testing Library for frontend tests.

## Global Constraints

- `code` is always stored and matched uppercase — normalized on write (trimmed + uppercased before insert/update), so every read is a plain equality/lookup, never `ILIKE`/`UPPER()`.
- `discount_value` is a whole integer: for `discount_type = 'percentage'`, 1-100; for `discount_type = 'fixed'`, cents (matching every other money field in this schema).
- `usage_limit` NULL means unlimited; `usage_count` starts at 0 and increments only on a successful `POST /api/promo-codes/validate` call — this is the app's only real "use" event, since no live order-placement flow exists anywhere (see the spec's Overview for why). Increment must be guarded against a race at the last remaining use (two concurrent requests against `usage_count === usage_limit - 1` must not both succeed).
- `expires_at` NULL means never expires.
- A not-found code and an inactive code both return `404` with the same shape a client can't distinguish from "doesn't exist" — matching this app's existing OTP-endpoint enumeration-resistance convention. Expired and usage-limit-reached are `400`, since those codes genuinely did/do exist.
- Admin CRUD pages use this app's original theme-adaptive `var(--color-*)` tokens, on their own dedicated `.admin-promo-codes-*` CSS namespace — never a fixed dark hex palette, never any `.admin-orders-*`/`.admin-products-*`/`.admin-dashboard-*` class name.
- `BagPage.jsx`'s discount is a **derived** value recomputed every render from the currently-applied code's `discount_type`/`discount_value` and the *current* `subtotalCents` — never frozen at the value returned when the code was first applied, so a later cart change (removing an item) correctly reflows a percentage discount.
- Nothing in this plan touches `CheckoutPage.jsx` — it has no real backend behind it at all (see the spec's Overview).
- No new dependencies.

---

## Task 1: Backend — `promo_codes` migration + customer-facing validate/apply service

**Files:**
- Create: `migrations/1786840804000_add-promo-codes-table.sql`
- Create: `src/services/promoCodeService.js`
- Test: `test/promoCodeService.test.js`

**Interfaces:**
- Produces: `validateAndApplyPromoCode(rawCode, subtotalCents)` → `Promise<{ ok: true, code, discount_type, discount_value, discount_cents } | { ok: false, reason: 'not_found' | 'inactive' | 'expired' | 'usage_limit_reached' }>`. Task 3's controller depends on this exact return shape.

- [ ] **Step 1: Create the migration `migrations/1786840804000_add-promo-codes-table.sql`**

```sql
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
```

- [ ] **Step 2: Write the failing test file `test/promoCodeService.test.js`**

```javascript
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
    // The guarded UPDATE
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
  assert.equal(result.discount_cents, 1500); // 15% of 10000
  assert.equal(query.mock.callCount(), 2);
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
  assert.equal(result.discount_cents, 1500); // capped at the subtotal, not the full 2000
});

test('validateAndApplyPromoCode returns usage_limit_reached if the guarded UPDATE affects zero rows (lost the race)', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return {
        rows: [{ code: 'RACER', discount_type: 'fixed', discount_value: 500, usage_limit: 1, usage_count: 0, expires_at: null, active: true }],
      };
    }
    // Simulates a concurrent request having already consumed the last use
    // between the SELECT and this UPDATE.
    return { rows: [] };
  });

  const result = await promoCodeService.validateAndApplyPromoCode('RACER', 10000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'usage_limit_reached');
});
```

- [ ] **Step 3: Run the test file to confirm it fails**

Run: `node --test test/promoCodeService.test.js`
Expected: FAIL — `src/services/promoCodeService.js` doesn't exist yet.

- [ ] **Step 4: Create `src/services/promoCodeService.js`**

```javascript
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

  return {
    ok: true,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_cents: computeDiscountCents(promo.discount_type, promo.discount_value, subtotalCents),
  };
}

module.exports = { validateAndApplyPromoCode };
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `node --test test/promoCodeService.test.js`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add migrations/1786840804000_add-promo-codes-table.sql src/services/promoCodeService.js test/promoCodeService.test.js
git commit -m "Add promo_codes table and the customer-facing validate/apply service"
```

---

## Task 2: Backend — admin promo code CRUD

**Files:**
- Create: `src/services/adminPromoCodeService.js`
- Create: `src/controllers/adminPromoCodeController.js`
- Create: `src/routes/adminPromoCodeRoutes.js`
- Modify: `src/app.js`
- Test: `test/adminPromoCodeService.test.js`
- Test: `test/adminPromoCodes.test.js`

**Interfaces:**
- Produces: `getPromoCodes()` → `Promise<object[]>` (all rows, `ORDER BY created_at DESC`). `createPromoCode(fields)` → `Promise<object>`, throws `ValidationError`/`ConflictError`. `updatePromoCode(code, fields)` → `Promise<object|null>`, throws `ValidationError`/`ConflictError`. `deletePromoCode(code)` → `Promise<boolean>`. Mounted at `GET/POST /api/admin/promo-codes`, `PATCH/DELETE /api/admin/promo-codes/:code`, admin-auth-gated. Task 5's frontend depends on this exact contract.

- [ ] **Step 1: Write the failing test file `test/adminPromoCodeService.test.js`**

```javascript
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
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `node --test test/adminPromoCodeService.test.js`
Expected: FAIL — `src/services/adminPromoCodeService.js` doesn't exist yet.

- [ ] **Step 3: Create `src/services/adminPromoCodeService.js`**

```javascript
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
       WHERE code = $6
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
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `node --test test/adminPromoCodeService.test.js`
Expected: PASS, all 13 tests.

- [ ] **Step 5: Write the failing test file `test/adminPromoCodes.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

const VALID_BODY = { code: 'SPRING15', discount_type: 'percentage', discount_value: 15 };

test('GET /api/admin/promo-codes requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/promo-codes returns every code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ code: 'SPRING15' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 1);
  });
});

test('POST /api/admin/promo-codes creates a code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...VALID_BODY, usage_limit: null, usage_count: 0, expires_at: null, active: true }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.code, 'SPRING15');
  });
});

test('POST /api/admin/promo-codes rejects a missing required field with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ ...VALID_BODY, discount_type: undefined }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/admin/promo-codes returns 409 for a duplicate code', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "promo_codes_pkey"');
    err.code = '23505';
    throw err;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 409);
  });
});

test('PATCH /api/admin/promo-codes/:code updates a code', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return { rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 0, expires_at: null, active: true }] };
    }
    return { rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 20, usage_limit: null, usage_count: 0, expires_at: null, active: true }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes/SPRING15`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ discount_value: 20 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.discount_value, 20);
  });
});

test('PATCH /api/admin/promo-codes/:code returns 404 for an unknown code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes/NOPE`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(res.status, 404);
  });
});

test('DELETE /api/admin/promo-codes/:code deletes a code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ code: 'SPRING15' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes/SPRING15`, { method: 'DELETE', headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
  });
});

test('DELETE /api/admin/promo-codes/:code returns 404 for an unknown code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/promo-codes/NOPE`, { method: 'DELETE', headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 6: Run the test file to confirm it fails**

Run: `node --test test/adminPromoCodes.test.js`
Expected: FAIL — no route exists yet.

- [ ] **Step 7: Create `src/controllers/adminPromoCodeController.js`**

```javascript
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
```

- [ ] **Step 8: Create `src/routes/adminPromoCodeRoutes.js`**

```javascript
const { Router } = require('express');
const {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
} = require('../controllers/adminPromoCodeController');

const router = Router();

router.get('/', listPromoCodes);
router.post('/', createPromoCode);
router.patch('/:code', updatePromoCode);
router.delete('/:code', deletePromoCode);

module.exports = router;
```

- [ ] **Step 9: Mount the route in `src/app.js`**

Find this line:

```javascript
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
```

Add immediately after it:

```javascript
const adminPromoCodeRoutes = require('./routes/adminPromoCodeRoutes');
```

Find this line:

```javascript
app.use('/api/admin/dashboard', requireAdminAuth, adminDashboardRoutes);
```

Add immediately after it:

```javascript
app.use('/api/admin/promo-codes', requireAdminAuth, adminPromoCodeRoutes);
```

- [ ] **Step 10: Run the test file to confirm it passes**

Run: `node --test test/adminPromoCodes.test.js`
Expected: PASS, all 9 tests.

- [ ] **Step 11: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 12: Commit**

```bash
git add src/services/adminPromoCodeService.js src/controllers/adminPromoCodeController.js src/routes/adminPromoCodeRoutes.js src/app.js test/adminPromoCodeService.test.js test/adminPromoCodes.test.js
git commit -m "Add admin promo code CRUD: create, list, update, delete"
```

---

## Task 3: Backend — customer-facing `POST /api/promo-codes/validate`

**Files:**
- Create: `src/controllers/promoCodeController.js`
- Create: `src/routes/promoCodeRoutes.js`
- Modify: `src/middleware/rateLimiter.js`
- Modify: `src/app.js`
- Test: `test/promoCodes.test.js`

**Interfaces:**
- Consumes: `promoCodeService.validateAndApplyPromoCode(code, subtotalCents)` from Task 1.
- Produces: `POST /api/promo-codes/validate` (customer-auth-gated, rate-limited) → `200 { code, discount_type, discount_value, discount_cents }` on success, `404 { error, reason: 'not_found' | 'inactive' }` or `400 { error, reason: 'expired' | 'usage_limit_reached' }` on failure. Task 6's `BagPage.jsx` depends on this exact contract, including the `reason` field.

- [ ] **Step 1: Write the failing test file `test/promoCodes.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueToken } = require('../src/services/authService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

// requireCustomerAuth (src/middleware/customerAuth.js) reads a Bearer
// token from the Authorization header, not a cookie - that's the admin
// auth convention (adminToken cookie), not the customer one. Same
// Authorization: `Bearer ${issueToken(email)}` pattern test/rateLimiter.test.js
// already uses for this exact middleware.
function customerAuthHeaders(email = 'jane.doe@example.com') {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${issueToken(email)}` };
}

test('POST /api/promo-codes/validate requires customer auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SPRING15', subtotal_cents: 10000 }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/promo-codes/validate returns 200 with discount_cents on a valid code', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) {
      return { rows: [{ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: null, usage_count: 0, expires_at: null, active: true }] };
    }
    return { rows: [{ code: 'SPRING15' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify({ code: 'SPRING15', subtotal_cents: 10000 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.discount_cents, 1500);
  });
});

test('POST /api/promo-codes/validate returns 404 with reason not_found for an unknown code', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify({ code: 'NOPE', subtotal_cents: 10000 }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.reason, 'not_found');
  });
});

test('POST /api/promo-codes/validate returns 400 with reason expired for an expired code', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ code: 'OLD10', discount_type: 'fixed', discount_value: 1000, usage_limit: null, usage_count: 0, expires_at: new Date(Date.now() - 60_000).toISOString(), active: true }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify({ code: 'OLD10', subtotal_cents: 10000 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.reason, 'expired');
  });
});

test('POST /api/promo-codes/validate rejects a missing code with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify({ subtotal_cents: 10000 }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/promo-codes/validate rejects a missing or non-integer subtotal_cents with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/promo-codes/validate`, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify({ code: 'SPRING15', subtotal_cents: 'not-a-number' }),
    });
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `node --test test/promoCodes.test.js`
Expected: FAIL — no route exists yet.

- [ ] **Step 3: Add `promoLimiter` to `src/middleware/rateLimiter.js`**

Find this block:

```javascript
const productsLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PRODUCTS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_PRODUCTS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
  handler: auditedHandler('products'),
});

module.exports = { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter, productsLimiter };
```

Replace it with:

```javascript
const productsLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PRODUCTS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_PRODUCTS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
  handler: auditedHandler('products'),
});

// Customer-keyed like chatLimiter/ordersLimiter above (requireCustomerAuth
// always runs first - see app.js) rather than IP-keyed like
// productsLimiter, since this endpoint mutates usage_count and sits
// behind real customer auth, unlike the public /api/products.
const promoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PROMO_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_PROMO_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByCustomer,
  message: { error: 'Too many promo code attempts, please try again shortly.' },
  handler: auditedHandler('promo'),
});

module.exports = { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter, productsLimiter, promoLimiter };
```

- [ ] **Step 4: Create `src/controllers/promoCodeController.js`**

```javascript
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
      return res.status(FAILURE_STATUS[result.reason]).json({ error: FAILURE_MESSAGE[result.reason], reason: result.reason });
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
```

- [ ] **Step 5: Create `src/routes/promoCodeRoutes.js`**

```javascript
const { Router } = require('express');
const { validate } = require('../controllers/promoCodeController');

const router = Router();

router.post('/validate', validate);

module.exports = router;
```

- [ ] **Step 6: Mount the route in `src/app.js`**

Find this line:

```javascript
const { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter, productsLimiter } = require('./middleware/rateLimiter');
```

Replace it with:

```javascript
const { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter, productsLimiter, promoLimiter } = require('./middleware/rateLimiter');
```

Find this line:

```javascript
const adminProductRoutes = require('./routes/adminProductRoutes');
```

Add immediately after it:

```javascript
const promoCodeRoutes = require('./routes/promoCodeRoutes');
```

Find this line:

```javascript
app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);
```

Add immediately after it:

```javascript
app.use('/api/promo-codes', requireCustomerAuth, promoLimiter, promoCodeRoutes);
```

- [ ] **Step 7: Run the test file to confirm it passes**

Run: `node --test test/promoCodes.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 8: Run the full backend suite to confirm nothing else regressed**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add src/controllers/promoCodeController.js src/routes/promoCodeRoutes.js src/middleware/rateLimiter.js src/app.js test/promoCodes.test.js
git commit -m "Add the customer-facing POST /api/promo-codes/validate endpoint"
```

---

## Task 4: Frontend — `AdminPromoCodesPage` (list) + nav tab

**Files:**
- Create: `frontend/src/pages/AdminPromoCodesPage.jsx`
- Create: `frontend/src/pages/AdminPromoCodesPage.test.jsx`
- Modify: `frontend/src/components/AdminNav.jsx`
- Modify: `frontend/src/components/AdminNav.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `GET /api/admin/promo-codes` → `object[]` (Task 2).
- Produces: nothing consumed by other tasks — leaf list page plus an additive `AdminNav` change.

- [ ] **Step 1: Write the failing test file `frontend/src/pages/AdminPromoCodesPage.test.jsx`**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminPromoCodesPage } from './AdminPromoCodesPage.jsx';

const CODES = [
  { code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: 100, usage_count: 12, expires_at: '2026-12-31T00:00:00Z', active: true },
  { code: 'BIGSAVE', discount_type: 'fixed', discount_value: 2000, usage_limit: null, usage_count: 3, expires_at: null, active: false },
];

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminPromoCodesPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: true, json: async () => CODES });
    return Promise.resolve({ ok: false });
  });
});

it('renders codes with formatted discount, usage, and expiry', async () => {
  renderPage();
  expect(await screen.findByText('SPRING15')).toBeInTheDocument();
  expect(screen.getByText('15%')).toBeInTheDocument();
  expect(screen.getByText('12 / 100')).toBeInTheDocument();

  expect(screen.getByText('BIGSAVE')).toBeInTheDocument();
  expect(screen.getByText('$20.00')).toBeInTheDocument();
  expect(screen.getByText('3 / ∞')).toBeInTheDocument();
  expect(screen.getByText('Never')).toBeInTheDocument();
});

it('shows an Active badge for active codes and Inactive for disabled ones', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});

it('links each row to its edit page', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByRole('link', { name: /spring15/i })).toHaveAttribute('href', '/admin/promo-codes/SPRING15/edit');
});

it('links to the new-code page', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByRole('link', { name: /new code/i })).toHaveAttribute('href', '/admin/promo-codes/new');
});

it('shows an empty state when there are no codes', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No promo codes yet.')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up promo codes.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });

  renderPage();

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/pages/AdminPromoCodesPage.test.jsx`
Expected: FAIL — `./AdminPromoCodesPage.jsx` doesn't exist yet.

- [ ] **Step 3: Create `frontend/src/pages/AdminPromoCodesPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function formatDiscount(code) {
  return code.discount_type === 'percentage' ? `${code.discount_value}%` : formatCents(code.discount_value);
}

function formatUsage(code) {
  return `${code.usage_count} / ${code.usage_limit == null ? '∞' : code.usage_limit}`;
}

function formatExpiry(code) {
  return code.expires_at ? dateFormatter.format(new Date(code.expires_at)) : 'Never';
}

export function AdminPromoCodesPage() {
  const { logout } = useAdminAuth();
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/admin/promo-codes')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up promo codes.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCodes(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-promo-codes-page">
      <div className="admin-promo-codes-head">
        <h1>Promo Codes</h1>
        <Link to="/admin/promo-codes/new" className="admin-promo-codes-new-link">
          New Code
        </Link>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <table className="admin-promo-codes-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Usage</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.code}>
                <td>
                  <Link to={`/admin/promo-codes/${code.code}/edit`}>{code.code}</Link>
                </td>
                <td>{formatDiscount(code)}</td>
                <td>{formatUsage(code)}</td>
                <td>{formatExpiry(code)}</td>
                <td>
                  <span className={`admin-promo-codes-status${code.active ? ' active' : ''}`}>
                    {code.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-promo-codes-empty-row">
                  No promo codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/pages/AdminPromoCodesPage.test.jsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Update `frontend/src/components/AdminNav.test.jsx` for the 5th tab**

Replace the whole file:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminNav } from './AdminNav.jsx';

function renderNav(initialPath = '/admin') {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') {
      return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    }
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });

  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AdminNav />}>
            <Route path="/admin" element={<p>Orders page</p>} />
            <Route path="/admin/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/admin/customers" element={<p>Customers page</p>} />
            <Route path="/admin/promo-codes" element={<p>Promo codes page</p>} />
            <Route path="/admin/orders/:orderNumber" element={<p>Order detail page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

it('renders all nav links and the signed-in admin email', async () => {
  renderNav();
  expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /promo codes/i })).toBeInTheDocument();
});

it('marks the Orders link active on /admin, not any other tab', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /promo codes/i })).not.toHaveClass('active');
});

it('marks the Dashboard link active on /admin/dashboard', async () => {
  renderNav('/admin/dashboard');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('marks the Customers link active on /admin/customers, not the Orders link', async () => {
  renderNav('/admin/customers');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /customers/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('marks the Promo Codes link active on /admin/promo-codes', async () => {
  renderNav('/admin/promo-codes');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /promo codes/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('keeps the Orders link active on an order detail page', async () => {
  renderNav('/admin/orders/ORD-1001');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
});

it('renders the routed page content via Outlet', async () => {
  renderNav('/admin');
  expect(await screen.findByText('Orders page')).toBeInTheDocument();
});

it('logs out when the logout button is clicked', async () => {
  renderNav();
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: /log out/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/auth/logout', { method: 'POST' });
  });
});
```

- [ ] **Step 6: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: FAIL — no Promo Codes link exists yet.

- [ ] **Step 7: Add the Promo Codes tab to `frontend/src/components/AdminNav.jsx`**

Replace the whole file:

```jsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  return (
    <div className="admin-nav-root">
      <nav className="admin-nav-bar" aria-label="Admin sections">
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink to="/admin" end className={`admin-nav-link${ordersActive ? ' active' : ''}`}>
          Orders
        </NavLink>
        <NavLink
          to="/admin/products"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Products
        </NavLink>
        <NavLink
          to="/admin/customers"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Customers
        </NavLink>
        <NavLink
          to="/admin/promo-codes"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Promo Codes
        </NavLink>
        <span className="admin-nav-spacer" />
        <span className="admin-nav-email">{email}</span>
        <button type="button" className="admin-nav-logout" onClick={logout}>
          Log out
        </button>
      </nav>
      <div className="admin-nav-content">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/components/AdminNav.test.jsx`
Expected: PASS, all 8 tests.

- [ ] **Step 9: Add the routes in `frontend/src/App.jsx`**

Find this block:

```jsx
const AdminProductFormPage = lazy(() =>
  import('./pages/AdminProductFormPage.jsx').then((m) => ({ default: m.AdminProductFormPage }))
);
```

Add immediately after it:

```jsx
const AdminPromoCodesPage = lazy(() =>
  import('./pages/AdminPromoCodesPage.jsx').then((m) => ({ default: m.AdminPromoCodesPage }))
);
const AdminPromoCodeFormPage = lazy(() =>
  import('./pages/AdminPromoCodeFormPage.jsx').then((m) => ({ default: m.AdminPromoCodeFormPage }))
);
```

Find this route:

```jsx
<Route path="customers/:email" element={<AdminCustomerDetailPage />} />
```

Add immediately after it:

```jsx
<Route path="promo-codes" element={<AdminPromoCodesPage />} />
<Route path="promo-codes/new" element={<AdminPromoCodeFormPage />} />
<Route path="promo-codes/:code/edit" element={<AdminPromoCodeFormPage />} />
```

`AdminPromoCodeFormPage` doesn't exist until Task 5 — this is fine, `lazy()` only resolves the import when the route is actually visited, and no test in this task visits `/admin/promo-codes/new` or `/admin/promo-codes/:code/edit`.

- [ ] **Step 10: Add the `.admin-promo-codes-*` CSS block to `frontend/src/index.css`**

Add this block anywhere sensible (it shares no selectors with anything else, so placement doesn't matter structurally):

```css
.admin-promo-codes-page {
  padding: var(--space-4);
}

.admin-promo-codes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.admin-promo-codes-new-link {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-decoration: none;
  white-space: nowrap;
}

.admin-promo-codes-new-link:hover {
  background: var(--color-surface-hover);
}

.admin-promo-codes-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.admin-promo-codes-table th,
.admin-promo-codes-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.admin-promo-codes-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.admin-promo-codes-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-promo-codes-empty-row {
  text-align: center;
  color: var(--color-text-muted);
}

.admin-promo-codes-status {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: 600;
  background: var(--color-error-surface);
  color: var(--color-error-text);
}

.admin-promo-codes-status.active {
  background: var(--color-success-surface);
  color: var(--color-success-text);
}
```

- [ ] **Step 11: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files except that `AdminPromoCodeFormPage.test.jsx` doesn't exist yet (that's Task 5) — no test in this task's scope references it.

- [ ] **Step 12: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors (the two new lazy-loaded routes reference `AdminPromoCodeFormPage.jsx`, which doesn't exist yet — if the build fails specifically because of this missing file, note it in your report as a known, expected gap that Task 5 closes; do not create a placeholder file to work around it).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/AdminPromoCodesPage.jsx frontend/src/pages/AdminPromoCodesPage.test.jsx frontend/src/components/AdminNav.jsx frontend/src/components/AdminNav.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Add the admin Promo Codes list page and a 5th nav tab"
```

---

## Task 5: Frontend — `AdminPromoCodeFormPage` (create/edit/delete)

**Files:**
- Create: `frontend/src/pages/AdminPromoCodeFormPage.jsx`
- Create: `frontend/src/pages/AdminPromoCodeFormPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/promo-codes/:code` — **does not exist**. There is no single-code GET endpoint (Task 2 only added list/create/update/delete). This form must load the existing code's data by fetching the full list (`GET /api/admin/promo-codes`, same endpoint `AdminPromoCodesPage` uses) and finding the matching row client-side — mirroring how `AdminProductFormPage.jsx` fetches a single product via a dedicated `GET /api/products/:slug`, except here there's no equivalent single-item admin GET, so the list is the only source. `POST/PATCH/DELETE /api/admin/promo-codes[/:code]` (Task 2).
- Produces: nothing consumed by other tasks — leaf form page.

- [ ] **Step 1: Write the failing test file `frontend/src/pages/AdminPromoCodeFormPage.test.jsx`**

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminPromoCodeFormPage } from './AdminPromoCodeFormPage.jsx';

const EXISTING_CODES = [
  { code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: 100, usage_count: 12, expires_at: '2026-12-31T00:00:00Z', active: true },
];

function renderForm(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/promo-codes/new" element={<AdminPromoCodeFormPage />} />
          <Route path="/admin/promo-codes/:code/edit" element={<AdminPromoCodeFormPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders an empty form for a new code', async () => {
  renderForm('/admin/promo-codes/new');
  expect(await screen.findByLabelText(/^code$/i)).toHaveValue('');
});

it('pre-fills the form with the existing code on edit', async () => {
  renderForm('/admin/promo-codes/SPRING15/edit');
  expect(await screen.findByLabelText(/^code$/i)).toHaveValue('SPRING15');
  expect(screen.getByLabelText(/discount value/i)).toHaveValue(15);
  expect(screen.getByLabelText(/^code$/i)).toBeDisabled();
});

it('shows a not-found error on edit when the code is missing from the list', async () => {
  renderForm('/admin/promo-codes/NOPE/edit');
  expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
});

it('submits a POST with the entered fields when creating', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ code: 'NEWCODE' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/new');
  await screen.findByLabelText(/^code$/i);
  fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'newcode' } });
  fireEvent.change(screen.getByLabelText(/discount type/i), { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes' && o?.method === 'POST');
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ code: 'newcode', discount_type: 'fixed', discount_value: 500 });
  });
});

it('submits a PATCH when editing an existing code', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    if (url === '/api/admin/promo-codes/SPRING15' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...EXISTING_CODES[0], discount_value: 20 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/SPRING15/edit');
  await screen.findByDisplayValue('SPRING15');
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes/SPRING15' && o?.method === 'PATCH');
    expect(call).toBeTruthy();
  });
});

it('deletes the code when Delete is clicked and the confirmation is accepted', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    if (url === '/api/admin/promo-codes/SPRING15' && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderForm('/admin/promo-codes/SPRING15/edit');
  await screen.findByDisplayValue('SPRING15');
  fireEvent.click(screen.getByRole('button', { name: /delete code/i }));

  expect(window.confirm).toHaveBeenCalledWith('Delete SPRING15? This cannot be undone.');

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes/SPRING15' && o?.method === 'DELETE');
    expect(call).toBeTruthy();
  });
});

it('surfaces an error when saving fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (opts?.method === 'POST') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'code already exists.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/new');
  await screen.findByLabelText(/^code$/i);
  fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'DUP' } });
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/code already exists/i);
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `cd frontend && npx vitest run src/pages/AdminPromoCodeFormPage.test.jsx`
Expected: FAIL — `./AdminPromoCodeFormPage.jsx` doesn't exist yet.

- [ ] **Step 3: Create `frontend/src/pages/AdminPromoCodeFormPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const EMPTY_FORM = {
  code: '',
  discount_type: 'percentage',
  discount_value: '',
  usage_limit: '',
  expires_at: '',
  active: true,
};

export function AdminPromoCodeFormPage() {
  const { logout } = useAdminAuth();
  const { code: editCode } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editCode);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // No single-code admin GET exists (see this task's own Interfaces note)
  // - the edit variant loads the full list (the same endpoint the list
  // page already uses) and finds the matching row client-side.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    fetch('/api/admin/promo-codes')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading that promo code.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const existing = data.find((c) => c.code === editCode);
        if (!existing) {
          throw new Error('Promo code not found.');
        }
        setForm({
          code: existing.code,
          discount_type: existing.discount_type,
          discount_value: String(existing.discount_value),
          usage_limit: existing.usage_limit != null ? String(existing.usage_limit) : '',
          expires_at: existing.expires_at ? existing.expires_at.slice(0, 10) : '',
          active: existing.active,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editCode, isEdit, logout]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      expires_at: form.expires_at || null,
      active: form.active,
    };
    if (!isEdit) body.code = form.code;

    try {
      const res = await fetch(isEdit ? `/api/admin/promo-codes/${editCode}` : '/api/admin/promo-codes', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || 'Something went wrong saving that promo code.');
      }
      navigate('/admin/promo-codes');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${form.code}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promo-codes/${editCode}`, { method: 'DELETE' });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong deleting that promo code.');
      }
      navigate('/admin/promo-codes');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="admin-promo-code-form-page">
      <h1>{isEdit ? `Edit ${form.code}` : 'New Promo Code'}</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor="admin-promo-code-code">Code</label>
        <input
          id="admin-promo-code-code"
          type="text"
          value={form.code}
          onChange={(e) => updateField('code', e.target.value)}
          disabled={isEdit}
          required
        />

        <label htmlFor="admin-promo-code-type">Discount Type</label>
        <select
          id="admin-promo-code-type"
          value={form.discount_type}
          onChange={(e) => updateField('discount_type', e.target.value)}
        >
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed amount (cents)</option>
        </select>

        <label htmlFor="admin-promo-code-value">Discount Value</label>
        <input
          id="admin-promo-code-value"
          type="number"
          min="1"
          value={form.discount_value}
          onChange={(e) => updateField('discount_value', e.target.value)}
          required
        />

        <label htmlFor="admin-promo-code-usage-limit">Usage Limit (optional)</label>
        <input
          id="admin-promo-code-usage-limit"
          type="number"
          min="1"
          value={form.usage_limit}
          onChange={(e) => updateField('usage_limit', e.target.value)}
        />

        <label htmlFor="admin-promo-code-expires">Expires (optional)</label>
        <input
          id="admin-promo-code-expires"
          type="date"
          value={form.expires_at}
          onChange={(e) => updateField('expires_at', e.target.value)}
        />

        {isEdit && (
          <label className="admin-promo-code-active-row">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => updateField('active', e.target.checked)}
            />
            Active
          </label>
        )}

        <div className="admin-promo-code-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isEdit && (
            <button type="button" className="admin-promo-code-delete-btn" onClick={handleDelete} disabled={saving}>
              Delete Code
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/pages/AdminPromoCodeFormPage.test.jsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Add form-page CSS to `frontend/src/index.css`**

Add this block anywhere sensible, near the `.admin-promo-codes-*` block added in Task 4 (or anywhere else — it shares no selectors with anything else):

```css
.admin-promo-code-form-page {
  padding: var(--space-4);
  max-width: 480px;
}

.admin-promo-code-form-page form {
  display: flex;
  flex-direction: column;
}

.admin-promo-code-form-page label {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.admin-promo-code-form-page input,
.admin-promo-code-form-page select {
  padding: 0.5rem 0.75rem;
  margin-top: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.admin-promo-code-active-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-direction: row !important;
}

.admin-promo-code-form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.admin-promo-code-delete-btn {
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius-md);
  background: var(--color-error-surface);
  color: var(--color-error-text);
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}
```

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 7: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors — this closes the gap Task 4 left (`AdminPromoCodeFormPage.jsx` now exists).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/AdminPromoCodeFormPage.jsx frontend/src/pages/AdminPromoCodeFormPage.test.jsx frontend/src/index.css
git commit -m "Add the admin Promo Code create/edit/delete form page"
```

---

## Task 6: Frontend — real promo code UI in `BagPage.jsx`

**Files:**
- Modify: `frontend/src/pages/BagPage.jsx`
- Modify: `frontend/src/pages/BagPage.test.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `POST /api/promo-codes/validate` → `{ code, discount_type, discount_value, discount_cents }` or `{ error, reason }` (Task 3). `useAuthorizedFetch()` from `../hooks/useAuthorizedFetch.js` (existing, unchanged — already used the same way by `OrderDetailPage.jsx`) — this is `BagPage.jsx`'s first-ever direct `fetch` call, everything else on the page today comes from `CartContext`/`ProductsContext`, neither of which makes an authenticated request.
- Produces: nothing consumed by other tasks — leaf page change.

- [ ] **Step 1: Wire up customer auth in the test file's render helper, then add the new tests**

`BagPage.jsx` is about to make its first-ever direct `fetch` call (Step 3 below uses `useAuthorizedFetch`, which reads the token from `AuthContext` and attaches it as an `Authorization: Bearer <token>` header — see `frontend/src/hooks/useAuthorizedFetch.js`, already used this exact way by `OrderDetailPage.jsx`). The existing `renderPage()`/`beforeEach()` in `frontend/src/pages/BagPage.test.jsx` don't wrap with `AuthProvider` or seed a token, because nothing in `BagPage.jsx` needed one before now. Update both.

Find this block near the top of the file:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { BagPage } from './BagPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', description: 'Over-ear comfort.', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', description: 'Tactile switches.', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'cable', name: 'USB-C Charging Cable (3-pack)', description: 'Fast-charging cables.', price_cents: 1999, icon: 'cable', colorways: [] },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsProvider>
        <CartProvider>
          <BagPage />
        </CartProvider>
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});
```

Replace it with:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { BagPage } from './BagPage.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', description: 'Over-ear comfort.', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', description: 'Tactile switches.', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'cable', name: 'USB-C Charging Cable (3-pack)', description: 'Fast-charging cables.', price_cents: 1999, icon: 'cable', colorways: [] },
];

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ProductsProvider>
          <CartProvider>
            <BagPage />
          </CartProvider>
        </ProductsProvider>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  // useAuthorizedFetch (used by the new promo-code Apply flow, Step 3
  // below) reads its token from AuthContext, which reads it from
  // sessionStorage at mount - same setup useAuthorizedFetch.test.jsx
  // already uses for testing any component that calls this hook.
  sessionStorage.setItem(TOKEN_STORAGE_KEY, 'the-token');
  global.fetch = vi.fn((url) => {
    if (String(url).startsWith('/api/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
    }
    return Promise.resolve({ ok: false });
  });
});
```

Every existing test below this point in the file is untouched — none of them override `global.fetch` in a way that conflicts with this change, since they were all already scoped to `/api/products` responses. Now append these three new tests to the end of the file:

```jsx
it('applies a valid promo code and shows the real discount', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (String(url).startsWith('/api/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
    }
    if (url === '/api/promo-codes/validate' && opts?.method === 'POST') {
      expect(opts.headers.Authorization).toBe('Bearer the-token');
      const body = JSON.parse(opts.body);
      expect(body.code).toBe('SPRING15');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, discount_cents: Math.round(body.subtotal_cents * 0.15) }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  fireEvent.change(screen.getByLabelText(/promo code/i), { target: { value: 'SPRING15' } });
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));

  expect(await screen.findByText('✓ SPRING15')).toBeInTheDocument();
  expect(screen.getByText('Promo (15%)')).toBeInTheDocument();
});

it('shows the server-provided reason when a promo code fails to apply', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (String(url).startsWith('/api/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
    }
    if (url === '/api/promo-codes/validate' && opts?.method === 'POST') {
      return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'That promo code has expired.', reason: 'expired' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  fireEvent.change(screen.getByLabelText(/promo code/i), { target: { value: 'OLD10' } });
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
});

it('removing an applied promo code clears the discount and restores the input', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (String(url).startsWith('/api/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
    }
    if (url === '/api/promo-codes/validate' && opts?.method === 'POST') {
      const body = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ code: 'SPRING15', discount_type: 'percentage', discount_value: 15, discount_cents: Math.round(body.subtotal_cents * 0.15) }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  fireEvent.change(screen.getByLabelText(/promo code/i), { target: { value: 'SPRING15' } });
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  await screen.findByText('✓ SPRING15');

  fireEvent.click(screen.getByRole('button', { name: /remove promo code/i }));

  expect(screen.queryByText('✓ SPRING15')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/promo code/i)).toBeInTheDocument();
  expect(screen.queryByText(/^Promo \(/)).not.toBeInTheDocument();
});
```

`useAuthorizedFetch` (Step 3) calls `logout()` on any `status === 401` response — none of these mocks return `401`, so that path isn't exercised here; it's already covered generically by `useAuthorizedFetch.test.jsx` itself and doesn't need re-testing per call site.

- [ ] **Step 2: Run the test file to confirm the new tests fail**

Run: `cd frontend && npx vitest run src/pages/BagPage.test.jsx`
Expected: FAIL — no promo code input exists in `BagPage.jsx` yet.

- [ ] **Step 3: Add promo code state and handlers to `frontend/src/pages/BagPage.jsx`**

Find this import line near the top of the file:

```jsx
import { useCart } from '../context/CartContext.jsx';
```

Add immediately before it:

```jsx
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
```

Find this line near the top of the component body:

```jsx
  const { items, setItems } = useCart();
```

Add immediately after it:

```jsx
  const authorizedFetch = useAuthorizedFetch();
```

Find this line, a little further down:

```jsx
  const [confirmProductId, setConfirmProductId] = useState(null);
```

Add immediately before it:

```jsx
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
```

Find this line (the existing hardcoded discount computation):

```jsx
  const discountCents = Math.round(subtotalCents * 0.15);
```

Replace it with:

```jsx
  // Derived from the CURRENTLY applied code's type/value and the CURRENT
  // subtotal every render - never frozen at whatever discount_cents the
  // server returned at apply-time, so removing an item after applying a
  // percentage code correctly shrinks the discount instead of leaving it
  // stale.
  const discountCents = !appliedPromo
    ? 0
    : appliedPromo.discount_type === 'percentage'
      ? Math.round((subtotalCents * appliedPromo.discount_value) / 100)
      : Math.min(appliedPromo.discount_value, subtotalCents);
```

Find this function (right after `handleClear`/near the other handlers — specifically, find `function startHold()` and add the new handlers immediately before it):

```jsx
  function startHold() {
```

Add immediately before it:

```jsx
  async function handleApplyPromo() {
    setPromoLoading(true);
    setPromoError(null);
    try {
      const res = await authorizedFetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode, subtotal_cents: subtotalCents }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Something went wrong applying that promo code.');
      }
      setAppliedPromo({ code: body.code, discount_type: body.discount_type, discount_value: body.discount_value });
      setPromoCode('');
    } catch (err) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  }

  function handleRemovePromo() {
    // No backend call - there's nothing to undo server-side. usage_count
    // was already incremented by the successful validate call (see
    // promoCodeService.js's own comment on why that's this app's one
    // real "use" event).
    setAppliedPromo(null);
    setPromoError(null);
  }

  function startHold() {
```

- [ ] **Step 4: Replace the fake promo UI in `BagPage.jsx`'s render**

Find this block (the static discount/promo rows in the summary aside):

```jsx
          {discountCents > 0 && (
            <div className="cart-saved-pill">You saved {formatCents(discountCents)}</div>
          )}

          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatCents(subtotalCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Delivery{deliverySelected.length > 0 ? ` ${deliverySelected.length} item${deliverySelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>{deliveryCents > 0 ? `+${formatCents(deliveryCents)}` : 'Free'}</span>
          </div>
          <div className="cart-summary-row">
            <span>Pickup{pickupSelected.length > 0 ? ` ${pickupSelected.length} item${pickupSelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>Free</span>
          </div>
          <div className="cart-summary-row discount">
            <span>Promo (15%)</span>
            <span>-{formatCents(discountCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Tax 7%</span>
            <span>{formatCents(taxCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Promo code</span>
            <span className="cart-promo-pill">&#10003; HAPPY2026</span>
          </div>
```

Replace it with:

```jsx
          {discountCents > 0 && (
            <div className="cart-saved-pill">You saved {formatCents(discountCents)}</div>
          )}

          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatCents(subtotalCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Delivery{deliverySelected.length > 0 ? ` ${deliverySelected.length} item${deliverySelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>{deliveryCents > 0 ? `+${formatCents(deliveryCents)}` : 'Free'}</span>
          </div>
          <div className="cart-summary-row">
            <span>Pickup{pickupSelected.length > 0 ? ` ${pickupSelected.length} item${pickupSelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>Free</span>
          </div>
          {appliedPromo && (
            <div className="cart-summary-row discount">
              <span>Promo {appliedPromo.discount_type === 'percentage' ? `(${appliedPromo.discount_value}%)` : ''}</span>
              <span>-{formatCents(discountCents)}</span>
            </div>
          )}
          <div className="cart-summary-row">
            <span>Tax 7%</span>
            <span>{formatCents(taxCents)}</span>
          </div>

          <div className="cart-promo-entry">
            {appliedPromo ? (
              <div className="cart-promo-applied-row">
                <span className="cart-promo-pill">&#10003; {appliedPromo.code}</span>
                <button type="button" onClick={handleRemovePromo} aria-label="Remove promo code">
                  &times;
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="cart-promo-input" className="sr-only">
                  Promo code
                </label>
                <input
                  id="cart-promo-input"
                  type="text"
                  placeholder="Promo code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={!promoCode.trim() || promoLoading}
                >
                  {promoLoading ? 'Applying…' : 'Apply'}
                </button>
              </>
            )}
          </div>
          {promoError && (
            <p className="cart-promo-error" role="alert">
              {promoError}
            </p>
          )}
```

Note `taxCents`'s own formula (`Math.round((subtotalCents - discountCents + deliveryCents) * 0.07)`) already reads `discountCents`, which is now correctly `0` when no code is applied — no change needed there, it already flows through correctly since `discountCents` is still the same variable name, just now derived from `appliedPromo` instead of a hardcoded `0.15`.

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `cd frontend && npx vitest run src/pages/BagPage.test.jsx`
Expected: PASS, all tests including the 3 new ones and every pre-existing test. Confirmed safe ahead of time: every pre-existing dollar assertion in this file (`$149.99`, `$169.98`, `$109.98`, `+$9.00`) checks an item's unit price or a raw subtotal, never the final `totalCents` — the only value the old hardcoded 15% discount affected — so no pre-existing test needs updating. The pre-existing tests never apply a promo code, so `appliedPromo` stays `null`, `discountCents` stays `0`, and the discount row simply doesn't render for them, which is correct and requires no assertion changes.

- [ ] **Step 6: Add promo-entry CSS to `frontend/src/index.css`**

Find the existing `.cart-promo-pill` rule (search by that selector text) and add these new rules near it:

```css
.cart-promo-entry {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: var(--space-2) 0;
}

.cart-promo-entry input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
}

.cart-promo-applied-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.cart-promo-error {
  color: var(--color-error-text);
  font-size: var(--font-size-sm);
  margin: 0 0 var(--space-2);
}
```

If `.cart-promo-pill` already has styling from before (it did, for the static "HAPPY2026" pill), leave that existing rule exactly as it is — it's reused as-is for the real applied-code pill, same class, same look.

- [ ] **Step 7: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all files.

- [ ] **Step 8: Build the frontend to confirm no bundling errors**

Run: `cd frontend && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/BagPage.jsx frontend/src/pages/BagPage.test.jsx frontend/src/index.css
git commit -m "Wire real promo code validation into BagPage, replacing the hardcoded 15% discount"
```

---

## Post-plan manual verification (not a task — do this after all six tasks land)

Start the dev server, log in as admin, then confirm in the browser:
1. `/admin/promo-codes` lists real codes; create a new percentage code, edit it, toggle it inactive, delete a different one.
2. Log in as a customer, go to `/bag`, apply the code created above — the discount row and total update correctly; remove it and the input comes back.
3. Apply an expired or usage-exhausted code (create one via the admin form with `expires_at` in the past, or `usage_limit: 1` and apply it twice) and confirm the specific error message shows.
4. Confirm `/checkout` still renders its existing fabricated content unchanged — this plan never touched it.
