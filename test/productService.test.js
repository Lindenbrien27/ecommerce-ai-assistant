const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const productService = require('../src/services/productService');

test('getProducts returns every row', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /SELECT .+ FROM products ORDER BY created_at ASC, slug ASC/);
    return { rows: [{ slug: 'headphones' }, { slug: 'keyboard' }] };
  });

  const products = await productService.getProducts();
  assert.equal(products.length, 2);
});

test('getProductBySlug returns the matching row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE slug = \$1/);
    assert.deepEqual(params, ['headphones']);
    return { rows: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] };
  });

  const product = await productService.getProductBySlug('headphones');
  assert.equal(product.name, 'Wireless Noise-Cancelling Headphones');
});

test('getProductBySlug returns null when nothing matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const product = await productService.getProductBySlug('nope');
  assert.equal(product, null);
});
