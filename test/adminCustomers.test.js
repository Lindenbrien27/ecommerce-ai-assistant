
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

test('GET /api/admin/customers requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/customers returns the aggregated customer list', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      {
        customer_email: 'jane.doe@example.com',
        order_count: '3',
        total_spent_cents: '15000',
        last_order_at: '2026-07-24T00:00:00Z',
      },
    ],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.customers.length, 1);
    assert.equal(body.customers[0].order_count, 3);
  });
});

test('GET /api/admin/customers?limit=abc returns 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers?limit=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/customers/:email returns the customer summary plus first page of orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY customer_email/.test(sql)) {
      return {
        rows: [
          {
            customer_email: 'jane.doe@example.com',
            order_count: '2',
            total_spent_cents: '30000',
            last_order_at: '2026-07-24T00:00:00Z',
          },
        ],
      };
    }
    return { rows: [{ order_number: 'ORD-1001', customer_email: 'jane.doe@example.com' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.email, 'jane.doe@example.com');
    assert.equal(body.orderCount, 2);
    assert.equal(body.totalSpentCents, 30000);
    assert.equal(body.orders.length, 1);
  });
});

test('GET /api/admin/customers/:email returns 404 for an email with no orders', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('nobody@example.com')}`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 404);
  });
});

test("GET /api/admin/customers/:email/orders returns a page of that customer's orders", async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1002', customer_email: 'jane.doe@example.com' }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}/orders`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1);
  });
});

test('GET /api/admin/customers/:email/orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}/orders`);
    assert.equal(res.status, 401);
  });
});
