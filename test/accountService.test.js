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
