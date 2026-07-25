const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueToken } = require('../src/services/authService');
const { auditLog, auditLogger } = require('../src/config/auditLog');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

// Every t.mock.method(auditLogger, 'info', ...) below intercepts calls made
// by *any* module that calls auditLog() - see the comment in
// src/config/auditLog.js on why mocking the shared logger object works
// across module boundaries where mocking the destructured auditLog
// function itself would not.

test('auditLog() logs details under the event name via the audit-tagged child logger', (t) => {
  t.mock.method(auditLogger, 'info', () => {});

  auditLog('some.event', { foo: 'bar' });

  assert.equal(auditLogger.info.mock.calls.length, 1);
  assert.deepEqual(auditLogger.info.mock.calls[0].arguments, [{ foo: 'bar' }, 'some.event']);
});

test('a failed verify attempt logs auth.verify_failed with the attempted order number and email', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(auditLogger, 'info', () => {});

  await withServer(t, async (base) => {
    await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'ORD-9999', email: 'Nobody@Example.com' }),
    });
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'auth.verify_failed');
  assert.ok(call, 'expected an auth.verify_failed audit log entry');
  assert.equal(call.arguments[0].orderNumber, 'ORD-9999');
  assert.equal(call.arguments[0].email, 'nobody@example.com');
});

test('a successful verify logs auth.verify_succeeded with the canonical email', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'Jane@Example.com' }],
  }));
  t.mock.method(auditLogger, 'info', () => {});

  await withServer(t, async (base) => {
    await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'ORD-1001', email: 'jane@example.com' }),
    });
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'auth.verify_succeeded');
  assert.ok(call, 'expected an auth.verify_succeeded audit log entry');
  assert.equal(call.arguments[0].email, 'Jane@Example.com');
});

test('a missing Authorization header logs auth.token_rejected with reason "missing"', async (t) => {
  t.mock.method(auditLogger, 'info', () => {});

  await withServer(t, async (base) => {
    await fetch(`${base}/api/orders`);
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'auth.token_rejected');
  assert.ok(call, 'expected an auth.token_rejected audit log entry');
  assert.equal(call.arguments[0].reason, 'missing');
});

test('an invalid token logs auth.token_rejected with reason "invalid"', async (t) => {
  t.mock.method(auditLogger, 'info', () => {});

  await withServer(t, async (base) => {
    await fetch(`${base}/api/orders`, { headers: { Authorization: 'Bearer not-a-real-token' } });
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'auth.token_rejected');
  assert.ok(call, 'expected an auth.token_rejected audit log entry');
  assert.equal(call.arguments[0].reason, 'invalid');
});

test('a lookup for a nonexistent order logs order.access_denied with reason "not_found"', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(auditLogger, 'info', () => {});

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    await fetch(`${base}/api/orders/ORD-0000`, { headers: { Authorization: `Bearer ${token}` } });
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'order.access_denied');
  assert.ok(call, 'expected an order.access_denied audit log entry');
  assert.equal(call.arguments[0].reason, 'not_found');
  assert.equal(call.arguments[0].requestedBy, 'jane@example.com');
  assert.ok(!('actualOwner' in call.arguments[0]));
});

test("a lookup for someone else's order logs order.access_denied with reason \"not_owned\" and the actual owner", async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'john@example.com' }],
  }));
  t.mock.method(auditLogger, 'info', () => {});

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    await fetch(`${base}/api/orders/ORD-1001`, { headers: { Authorization: `Bearer ${token}` } });
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'order.access_denied');
  assert.ok(call, 'expected an order.access_denied audit log entry');
  assert.equal(call.arguments[0].reason, 'not_owned');
  assert.equal(call.arguments[0].requestedBy, 'jane@example.com');
  assert.equal(call.arguments[0].actualOwner, 'john@example.com');
});

test('exceeding the auth rate limit logs rate_limit.exceeded', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(auditLogger, 'info', () => {});

  const max = Number(process.env.RATE_LIMIT_AUTH_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_AUTH_MAX must be set for this test');

  await withServer(t, async (base) => {
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ orderNumber: 'ORD-1001', email: 'jane@example.com' });

    for (let i = 0; i < max; i += 1) {
      await fetch(`${base}/api/auth/verify`, { method: 'POST', headers, body });
    }
    const res = await fetch(`${base}/api/auth/verify`, { method: 'POST', headers, body });
    assert.equal(res.status, 429);
  });

  const call = auditLogger.info.mock.calls.find((c) => c.arguments[1] === 'rate_limit.exceeded');
  assert.ok(call, 'expected a rate_limit.exceeded audit log entry');
  assert.equal(call.arguments[0].limiter, 'auth');
});
