const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminProductService = require('../src/services/adminProductService');

const VALID_FIELDS = {
  slug: 'new-product',
  name: 'New Product',
  category: 'Accessories',
  price_cents: 1999,
  sku: 'ACC-NP-999',
};

test('createProduct rejects a missing required field', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, name: undefined }),
    adminProductService.ValidationError
  );
});

test('createProduct rejects a non-integer price_cents', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, price_cents: 19.99 }),
    adminProductService.ValidationError
  );
});

test('createProduct rejects a negative stock_quantity', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, stock_quantity: -1 }),
    adminProductService.ValidationError
  );
});

test('createProduct rejects a slug that is not a safe URL/path segment', async (t) => {
  // slug is both the primary key and the literal :slug path segment in
  // /api/products/:slug, /admin/products/:slug/edit, and /shop/:productId -
  // a `/` here would create a row no route could ever fetch or edit again.
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, slug: 'bad/slug' }),
    (err) => {
      assert.ok(err instanceof adminProductService.ValidationError);
      assert.match(err.message, /slug must be lowercase alphanumeric with hyphens/);
      return true;
    }
  );
});

test('createProduct rejects an uppercase or space-containing slug', async (t) => {
  await assert.rejects(
    adminProductService.createProduct({ ...VALID_FIELDS, slug: 'Bad Slug' }),
    adminProductService.ValidationError
  );
});

test('createProduct inserts and returns the new row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /INSERT INTO products/);
    assert.equal(params[0], 'new-product');
    return { rows: [{ ...VALID_FIELDS, stock_quantity: 0, colorways: [] }] };
  });

  const product = await adminProductService.createProduct(VALID_FIELDS);
  assert.equal(product.slug, 'new-product');
});

test('createProduct surfaces a slug/sku collision as ConflictError', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_pkey"');
    err.code = '23505';
    err.constraint = 'products_pkey';
    throw err;
  });

  await assert.rejects(adminProductService.createProduct(VALID_FIELDS), adminProductService.ConflictError);
});

test('createProduct surfaces a sku collision distinctly from a slug collision', async (t) => {
  t.mock.method(pool, 'query', async () => {
    const err = new Error('duplicate key value violates unique constraint "products_sku_key"');
    err.code = '23505';
    err.constraint = 'products_sku_key';
    throw err;
  });

  await assert.rejects(adminProductService.createProduct(VALID_FIELDS), (err) => {
    assert.ok(err instanceof adminProductService.ConflictError);
    assert.equal(err.field, 'sku');
    return true;
  });
});

test('updateProduct returns null when the slug does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const product = await adminProductService.updateProduct('nope', { name: 'New Name' });
  assert.equal(product, null);
});

test('updateProduct merges the given fields onto the existing row', async (t) => {
  let call = 0;
  t.mock.method(pool, 'query', async (sql, params) => {
    call += 1;
    if (call === 1) {
      return { rows: [{ slug: 'headphones', name: 'Old Name', description: 'Old desc', category: 'Audio', price_cents: 100, original_price_cents: null, cover_image_url: null, icon: 'headphones', sku: 'AUD-HP-001', stock_quantity: 5, colorways: [] }] };
    }
    assert.match(sql, /UPDATE products SET/);
    assert.equal(params[0], 'New Name'); // name
    assert.equal(params[3], 100); // price_cents unchanged from current row
    return { rows: [{ slug: 'headphones', name: 'New Name', price_cents: 100 }] };
  });

  const product = await adminProductService.updateProduct('headphones', { name: 'New Name' });
  assert.equal(product.name, 'New Name');
});

test('deleteProduct returns true when a row was deleted', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /DELETE FROM products WHERE slug = \$1/);
    assert.deepEqual(params, ['headphones']);
    return { rows: [{ slug: 'headphones' }] };
  });

  const deleted = await adminProductService.deleteProduct('headphones');
  assert.equal(deleted, true);
});

test('deleteProduct returns false when the slug does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const deleted = await adminProductService.deleteProduct('nope');
  assert.equal(deleted, false);
});
