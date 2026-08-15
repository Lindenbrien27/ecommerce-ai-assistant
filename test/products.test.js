const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('GET /api/products requires no auth and returns every product', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'headphones' }, { slug: 'keyboard' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.products.length, 2);
  });
});

test('GET /api/products/:slug returns the matching product with no auth', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products/headphones`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.slug, 'headphones');
  });
});

test('GET /api/products/:slug returns 404 for an unknown slug', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/products/nope`);
    assert.equal(res.status, 404);
  });
});
