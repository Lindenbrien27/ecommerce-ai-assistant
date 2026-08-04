const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const { issueToken } = require('../src/services/authService');
const app = require('../src/app');

// orderService caches order lookups (src/config/cache.js) - doesn't change
// what these tests assert on (HTTP status codes, not pool.query call
// counts), but keeps this file consistent with the others that mock
// pool.query directly, in case a later test here relies on a fresh lookup.
test.beforeEach(() => orderCache.clear());

// Isolated in its own file so node:test's per-file process isolation gives
// this a fresh chatLimiter/ordersLimiter/authLimiter counter, unaffected by
// calls made in app.test.js.
test('returns 429 once a client exceeds RATE_LIMIT_MAX requests to /api/chat', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_MAX must be set for this test');

  const token = issueToken('jane@example.com');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const body = JSON.stringify({ messages: [] });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers, body });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers, body });
  assert.equal(res.status, 429);
});

test('returns 429 once a client exceeds RATE_LIMIT_ORDERS_MAX requests to /api/orders/:id', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_ORDERS_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_ORDERS_MAX must be set for this test');

  const token = issueToken('jane@example.com');
  const headers = { Authorization: `Bearer ${token}` };

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/orders/ORD-1001`, { headers });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/orders/ORD-1001`, { headers });
  assert.equal(res.status, 429);
});

test('/api/chat rate limit is keyed by authenticated customer, not source IP - two customers from the same connection get separate budgets', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_MAX must be set for this test');

  // Every request in this test comes from the same test process (the same
  // IP either way) - a key generator that fell back to req.ip regardless
  // of identity would exhaust jane's and john's requests out of one shared
  // bucket. Keyed by customer, each gets their own full budget. Emails
  // unique to this test, not reused from the file's other tests - the
  // limiter's in-memory store is a module-level singleton shared across
  // every test in this file, so a previously-exhausted identity would still
  // read as rate-limited here.
  const janeHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${issueToken('rate-limit-key-test-jane@example.com')}`,
  };
  const johnHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${issueToken('rate-limit-key-test-john@example.com')}`,
  };
  // Empty on purpose, same as the test above - this fails validation with a
  // 400 before ever reaching the real Anthropic call (no real
  // ANTHROPIC_API_KEY in test/CI), but the rate limiter runs before route
  // validation either way, so the budget still counts down. All this test
  // needs is a consistent, cheap non-429 status to count against the limit.
  const body = JSON.stringify({ messages: [] });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: janeHeaders, body });
    assert.notEqual(res.status, 429, `jane's request ${i + 1} should not be rate limited yet`);
  }
  const janeOverLimit = await fetch(`${base}/api/chat`, { method: 'POST', headers: janeHeaders, body });
  assert.equal(janeOverLimit.status, 429, "jane should now be rate limited on jane's own budget");

  // john hasn't made a single request yet - his budget should be untouched
  // by jane's, even though both came from the same IP.
  const johnFirstRequest = await fetch(`${base}/api/chat`, { method: 'POST', headers: johnHeaders, body });
  assert.notEqual(johnFirstRequest.status, 429, "john's first request should not be affected by jane's limit");
});

test('returns 429 once a client exceeds RATE_LIMIT_AUTH_MAX requests to /api/auth/otp/request', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_AUTH_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_AUTH_MAX must be set for this test');

  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ email: 'jane@example.com' });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/auth/otp/request`, { method: 'POST', headers, body });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/auth/otp/request`, { method: 'POST', headers, body });
  assert.equal(res.status, 429);
});

test('returns 429 once a client exceeds RATE_LIMIT_ACCOUNT_MAX requests to /api/account/profile', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_ACCOUNT_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_ACCOUNT_MAX must be set for this test');

  const token = issueToken('jane@example.com');
  const headers = { Authorization: `Bearer ${token}` };

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/account/profile`, { headers });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/account/profile`, { headers });
  assert.equal(res.status, 429);
});
