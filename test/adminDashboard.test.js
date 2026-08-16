const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

test('GET /api/admin/dashboard requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/dashboard returns the aggregate stats and top products', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) {
      return { rows: [{ product_name: 'Headphones', product_icon: 'headphones', revenue_cents: '16798', units_sold: '1' }] };
    }
    return { rows: [{ total_orders: '1', total_revenue_cents: '16798' }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_orders, 1);
    assert.equal(body.total_revenue_cents, 16798);
    assert.equal(body.average_order_value_cents, 16798);
    assert.equal(body.top_products.length, 1);
    assert.equal(body.top_products[0].product_name, 'Headphones');
  });
});

test('GET /api/admin/dashboard returns 500 with a generic message on a query failure', async (t) => {
  t.mock.method(pool, 'query', async () => {
    throw new Error('boom');
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/dashboard`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.match(body.error, /something went wrong/i);
  });
});
