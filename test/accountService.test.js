const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const accountService = require('../src/services/accountService');

test('getProfile returns the matching row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /FROM customer_profiles WHERE email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return { rows: [{ email: 'jane.doe@example.com', name: 'Jane Doe', username: 'janedoe', role: 'admin', bio: null, photo_url: null }] };
  });

  const profile = await accountService.getProfile('jane.doe@example.com');
  assert.equal(profile.name, 'Jane Doe');
});

test('getProfile returns all-null defaults when no row exists yet', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const profile = await accountService.getProfile('nobody@example.com');
  assert.deepEqual(profile, {
    email: 'nobody@example.com',
    name: null,
    username: null,
    role: null,
    bio: null,
    photo_url: null,
  });
});

test('getProfile lowercases the email before querying', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.deepEqual(params, ['jane.doe@example.com']);
    return { rows: [] };
  });

  await accountService.getProfile('Jane.Doe@Example.com');
});

test('upsertProfile issues an insert-or-update keyed on email', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /INSERT INTO customer_profiles/);
    assert.match(sql, /ON CONFLICT \(email\) DO UPDATE/);
    assert.deepEqual(params, ['jane.doe@example.com', 'Jane Doe', 'janedoe', 'admin', 'Loves headphones', 'https://example.com/photo.jpg']);
    return { rows: [{ email: 'jane.doe@example.com', name: 'Jane Doe', username: 'janedoe', role: 'admin', bio: 'Loves headphones', photo_url: 'https://example.com/photo.jpg' }] };
  });

  const profile = await accountService.upsertProfile('jane.doe@example.com', {
    name: 'Jane Doe',
    username: 'janedoe',
    role: 'admin',
    bio: 'Loves headphones',
    photo_url: 'https://example.com/photo.jpg',
  });
  assert.equal(profile.username, 'janedoe');
});

test('getAddress returns all-null defaults when no row exists yet', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const address = await accountService.getAddress('nobody@example.com');
  assert.deepEqual(address, {
    email: 'nobody@example.com',
    line1: null,
    line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    phone: null,
  });
});

test('upsertAddress issues an insert-or-update keyed on email', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /INSERT INTO customer_addresses/);
    assert.match(sql, /ON CONFLICT \(email\) DO UPDATE/);
    return { rows: [{ email: 'jane.doe@example.com', line1: '1 Main St', line2: null, city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US', phone: null }] };
  });

  const address = await accountService.upsertAddress('jane.doe@example.com', {
    line1: '1 Main St', line2: null, city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US', phone: null,
  });
  assert.equal(address.city, 'Springfield');
});

test('deleteAddress issues a delete keyed on email', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /DELETE FROM customer_addresses WHERE email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return { rows: [] };
  });

  await accountService.deleteAddress('jane.doe@example.com');
  assert.equal(query.mock.callCount(), 1);
});

test('getPaymentMethod returns all-null defaults when no row exists yet', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const method = await accountService.getPaymentMethod('nobody@example.com');
  assert.deepEqual(method, {
    email: 'nobody@example.com',
    brand: null,
    last4: null,
    expiry_month: null,
    expiry_year: null,
    billing_name: null,
  });
});

test('upsertPaymentMethod issues an insert-or-update keyed on email', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /INSERT INTO customer_payment_methods/);
    assert.match(sql, /ON CONFLICT \(email\) DO UPDATE/);
    return { rows: [{ email: 'jane.doe@example.com', brand: 'Visa', last4: '4242', expiry_month: 8, expiry_year: 2030, billing_name: 'Jane Doe' }] };
  });

  const method = await accountService.upsertPaymentMethod('jane.doe@example.com', {
    brand: 'Visa', last4: '4242', expiry_month: 8, expiry_year: 2030, billing_name: 'Jane Doe',
  });
  assert.equal(method.last4, '4242');
});

test('deletePaymentMethod issues a delete keyed on email', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /DELETE FROM customer_payment_methods WHERE email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return { rows: [] };
  });

  await accountService.deletePaymentMethod('jane.doe@example.com');
  assert.equal(query.mock.callCount(), 1);
});
