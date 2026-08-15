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

const VALID_BODY = { slug: 'new-product', name: 'New Product', category: 'Accessories', price_cents: 1999, sku: 'ACC-NP-999' };

test('POST /api/admin/products requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/products creates a product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...VALID_BODY, stock_quantity: 0, colorways: [] }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.slug, 'new-product');
  });
});

test('POST /api/admin/products rejects a missing required field with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ ...VALID_BODY, name: undefined }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/admin/products returns 409 for a duplicate slug', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_pkey"');
    err.code = '23505';
    err.constraint = 'products_pkey';
    throw err;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 409);
  });
});

test('PATCH /api/admin/products/:slug updates a product', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE products/.test(sql)) return { rows: [{ ...VALID_BODY, name: 'Updated Name' }] };
    return { rows: [{ ...VALID_BODY }] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/new-product`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Updated Name');
  });
});

test('PATCH /api/admin/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/nope`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ name: 'New Name' }),
    });
    assert.equal(res.status, 404);
  });
});

test('DELETE /api/admin/products/:slug deletes a product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'new-product' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/new-product`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
  });
});

test('DELETE /api/admin/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/products/nope`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 404);
  });
});
