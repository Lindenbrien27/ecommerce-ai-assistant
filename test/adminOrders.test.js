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
    assert.deepEqual(params.slice(2), [10, 10]);
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

test('POST /api/admin/orders/:orderNumber/refund requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 409 for an already-refunded order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: '2026-01-01T00:00:00Z' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 1000, restock: false }),
    });
    assert.equal(res.status, 409);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 400 for an amount over the order total', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: null }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 999999, restock: false }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/admin/orders/:orderNumber/refund returns 400 for a cancelled order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'cancelled', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: null }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 5000, restock: true }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /cancelled/i);
  });
});

test('POST /api/admin/orders/:orderNumber/refund succeeds with a full round-trip response', async (t) => {

  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) {
      return { rows: [{ order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'delivered', unit_price_cents: 5000, delivery_cost_cents: 0, vat_cents: 0, voucher_cents: 0, refunded_at: null }] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql) => {
      if (/^UPDATE orders/.test(sql.trim())) {
        return { rows: [{ order_number: 'ORD-1001', status: 'returned', refund_amount_cents: 5000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
      }
      return { rows: [] };
    },
    release: () => {},
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ amount_cents: 5000, restock: false, reason: 'Wrong size' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'returned');
    assert.equal(body.refund_amount_cents, 5000);
  });
});
