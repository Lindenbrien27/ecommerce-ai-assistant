const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueToken } = require('../src/services/authService');
const app = require('../src/app');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

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
