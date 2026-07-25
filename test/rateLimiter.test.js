const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueToken } = require('../src/services/authService');
const app = require('../src/app');

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

test('returns 429 once a client exceeds RATE_LIMIT_AUTH_MAX requests to /api/auth/verify', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_AUTH_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_AUTH_MAX must be set for this test');

  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ orderNumber: 'ORD-1001', email: 'jane@example.com' });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/auth/verify`, { method: 'POST', headers, body });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/auth/verify`, { method: 'POST', headers, body });
  assert.equal(res.status, 429);
});
