const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

test.beforeEach(() => orderCache.clear());

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

function mockOrdersQuery(t, { total = 0, rows = [] } = {}) {
  return t.mock.method(pool, 'query', async (sql) =>
    (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: String(total) }] } : { rows })
  );
}

test('GET /api/admin/orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/orders returns orders across all customers with a total count', async (t) => {
  mockOrdersQuery(t, { total: 1, rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }] });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1);
    assert.equal(body.orders[0].customer_email, 'jane@example.com');
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 20);
  });
});

test('GET /api/admin/orders?page=2&pageSize=10 forwards page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '15' }] };
    assert.deepEqual(params.slice(2), [10, 10]); // pageSize 10, offset (2-1)*10
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=2&pageSize=10`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.page, 2);
    assert.equal(body.pageSize, 10);
  });
});

test('GET /api/admin/orders?page=abc returns 400 for a non-integer page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?page=0 returns 400 for a non-positive page', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?page=0`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?pageSize=abc returns 400 for a non-integer pageSize', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?pageSize=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders?status=pending returns 400 for a non-real status', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders?status=pending`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/orders/:orderNumber returns the order regardless of owner', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order_number, 'ORD-1001');
  });
});

test('GET /api/admin/orders/:orderNumber returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 404);
  });
});

test('PATCH /api/admin/orders/:orderNumber/status updates the status', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE orders/.test(sql)) {
      return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
    }
    return { rows: [] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'shipped' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'shipped');
  });
});

test('PATCH /api/admin/orders/:orderNumber/status rejects a non-real status with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'pending' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PATCH /api/admin/orders/:orderNumber/status returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ status: 'shipped' }),
    });
    assert.equal(res.status, 404);
  });
});
