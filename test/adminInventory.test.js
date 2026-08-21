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

function sequentialMock(t, results) {
  let i = 0;
  return t.mock.method(pool, 'query', async () => {
    const result = results[i];
    i += 1;
    assert.ok(result, `unexpected extra pool.query call #${i}`);
    return result;
  });
}

function stockLedgerMockResults() {
  return [
    { rows: [{ category: 'Audio' }] },
    { rows: [{ id: 1, name: 'Warehouse A' }] },
    { rows: [{ id: 1, name: 'Acme Supplies' }] },
    { rows: [{ total: '0' }] },
    { rows: [] },
    {
      rows: [{
        days_of_cover: null,
        reorder_risk_count: '0',
        total_skus: '0',
        units_on_hand: '0',
        allocated: '0',
        out_of_stock_count: '0',
        low_stock_count: '0',
        in_stock_count: '0',
      }],
    },
    { rows: [{ total_stock_value_cents: '0' }] },
    { rows: [{ avg_lead_time_days: '0' }] },
  ];
}

function reorderQueueMockResults() {
  return [
    { rows: [{ id: 1, name: 'Acme Supplies' }] },
    { rows: [{ total: '0' }] },
    { rows: [] },
    { rows: [{ needing_action_count: '0', out_of_stock_count: '0', low_stock_count: '0', at_risk_value_cents: '0' }] },
  ];
}

function purchaseOrdersMockResults() {
  return [
    { rows: [{ total: '0' }] },
    { rows: [] },
    { rows: [{ total: '0' }] },
  ];
}

test('GET /api/admin/inventory requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/inventory?page=0 returns 400 for invalid pagination', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory?page=0`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory?page=abc returns 400 for invalid pagination', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory returns the stock ledger shape', async (t) => {
  sequentialMock(t, stockLedgerMockResults());

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items));
    assert.equal(body.total, 0);
  });
});

test('GET /api/admin/inventory?location=abc returns 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory?location=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory?supplier=abc returns 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory?supplier=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory?location=1 still returns 200', async (t) => {
  sequentialMock(t, stockLedgerMockResults());

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory?location=1`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
  });
});

test('GET /api/admin/inventory/reorder requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/reorder`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/inventory/reorder?page=abc returns 400 for invalid pagination', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/reorder?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory/reorder returns the reorder queue shape', async (t) => {
  sequentialMock(t, reorderQueueMockResults());

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/reorder`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items));
    assert.equal(body.total, 0);
  });
});

test('GET /api/admin/inventory/reorder?supplier=abc returns 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/reorder?supplier=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory/purchase-orders requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/purchase-orders`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/inventory/purchase-orders?page=abc returns 400 for invalid pagination', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/purchase-orders?page=abc`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 400);
  });
});

test('GET /api/admin/inventory/purchase-orders returns the purchase orders shape', async (t) => {
  sequentialMock(t, purchaseOrdersMockResults());

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/inventory/purchase-orders`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.purchaseOrders));
    assert.equal(body.openCount, 0);
  });
});
