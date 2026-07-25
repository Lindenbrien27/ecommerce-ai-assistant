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

test('GET /health reports ok (no auth required)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('POST /api/auth/verify issues a token when order number + email match', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'ORD-1001', email: 'jane@example.com' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(typeof body.token === 'string' && body.token.length > 0);
  });
});

test('POST /api/auth/verify rejects a mismatched email', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'ORD-1001', email: 'someone-else@example.com' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/auth/verify rejects missing fields', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber: 'ORD-1001' }),
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/orders/:id without a token is rejected', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/ORD-1001`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/orders without a token is rejected', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/orders lists only the authenticated customer\'s orders', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE customer_email = \$1/);
    assert.deepEqual(params, ['jane@example.com']);
    return { rows: [{ order_number: 'ORD-1001' }, { order_number: 'ORD-1002' }] };
  });

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 2);
  });
});

test('POST /api/chat without a token is rejected', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(res.status, 401);
  });
});

test('GET /api/orders/:id returns order data when the token owner matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com', status: 'shipped' }],
  }));

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/ORD-1001`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order_number, 'ORD-1001');
  });
});

test('GET /api/orders/:id returns 404 when the order belongs to a different customer', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com', status: 'shipped' }],
  }));

  const token = issueToken('someone-else@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/ORD-1001`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });
});

test('GET /api/orders/:id returns 404 when missing', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/NOPE`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/chat rejects a request with no messages', async (t) => {
  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(res.status, 400);
  });
});
