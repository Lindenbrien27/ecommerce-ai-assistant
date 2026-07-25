const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const app = require('../src/app');

const AUTH_HEADERS = { 'X-API-Key': process.env.API_KEY };

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('GET /api/config returns the real API key at request time (no auth required)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.apiKey, process.env.API_KEY);
  });
});

test('GET /health reports ok (no auth required)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('GET /api/orders/:id without an API key is rejected', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/ORD-1001`);
    assert.equal(res.status, 401);
  });
});

test('POST /api/chat without an API key is rejected', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(res.status, 401);
  });
});

test('GET /api/orders/:id returns order data with a valid API key', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/ORD-1001`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order_number, 'ORD-1001');
  });
});

test('GET /api/orders/:id returns 404 when missing', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/orders/NOPE`, { headers: AUTH_HEADERS });
    assert.equal(res.status, 404);
  });
});

test('POST /api/chat rejects a request with no messages', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(res.status, 400);
  });
});
