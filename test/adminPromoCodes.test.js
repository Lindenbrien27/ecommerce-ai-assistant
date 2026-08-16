const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

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
