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

test('GET /health/db reports ok when the database is reachable', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ '?column?': 1 }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health/db`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('GET /health/db reports 503 when the database is unreachable', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('connection refused');
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health/db`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: 'error' });
  });
});

test('a malformed JSON request body gets a JSON 400, not Express\'s default HTML error page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'Malformed JSON in request body.');
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
    assert.equal(params[0], 'jane@example.com');
    return { rows: [{ order_number: 'ORD-1001' }, { order_number: 'ORD-1002' }] };
  });

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 2);
    assert.equal(body.nextCursor, null);
  });
});

test('GET /api/orders returns a nextCursor and honors limit when more rows remain', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /LIMIT \$4/);
    assert.equal(params[3], 3); // limit + 1, to detect a next page
    return {
      rows: [
        { order_number: 'ORD-1001', created_at: '2026-01-03T00:00:00Z', id: 3 },
        { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
        { order_number: 'ORD-1003', created_at: '2026-01-01T00:00:00Z', id: 1 },
      ],
    };
  });

  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders?limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 2);
    assert.ok(typeof body.nextCursor === 'string' && body.nextCursor.length > 0);
  });
});

test('GET /api/orders rejects a non-integer limit', async (t) => {
  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders?limit=abc`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/orders rejects a malformed cursor', async (t) => {
  const token = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders?cursor=not-valid-base64url-json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
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
