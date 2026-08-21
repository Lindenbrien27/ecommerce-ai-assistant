const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const { issueToken } = require('../src/services/authService');
const { OAuth2Client } = require('google-auth-library');
const app = require('../src/app');

test.beforeEach(() => orderCache.clear());

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

  const janeHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${issueToken('rate-limit-key-test-jane@example.com')}`,
  };
  const johnHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${issueToken('rate-limit-key-test-john@example.com')}`,
  };

  const body = JSON.stringify({ messages: [] });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: janeHeaders, body });
    assert.notEqual(res.status, 429, `jane's request ${i + 1} should not be rate limited yet`);
  }
  const janeOverLimit = await fetch(`${base}/api/chat`, { method: 'POST', headers: janeHeaders, body });
  assert.equal(janeOverLimit.status, 429, "jane should now be rate limited on jane's own budget");

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

test('returns 429 once a client exceeds RATE_LIMIT_ADMIN_LOGIN_MAX requests to POST /api/admin/auth/google', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ email: 'lindenbrien27@gmail.com', email_verified: true }),
  }));
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 1, email: 'lindenbrien27@gmail.com' }] }));

  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_ADMIN_LOGIN_MAX must be set for this test');

  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ idToken: 'a-real-looking-id-token' });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/admin/auth/google`, { method: 'POST', headers, body });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/admin/auth/google`, { method: 'POST', headers, body });
  assert.equal(res.status, 429);
});

test('GET /api/admin/auth/me is never rate limited, even well past RATE_LIMIT_ADMIN_LOGIN_MAX requests', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_ADMIN_LOGIN_MAX must be set for this test');

  for (let i = 0; i < max + 5; i += 1) {
    const res = await fetch(`${base}/api/admin/auth/me`);
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited`);
  }
});
