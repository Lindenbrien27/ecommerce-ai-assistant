const test = require('node:test');
const assert = require('node:assert/strict');
const { issueToken } = require('../src/services/authService');
const { issueAdminToken, verifyAdminToken } = require('../src/services/adminAuthService');
const { pool } = require('../src/config/db');

test('issueAdminToken/verifyAdminToken round-trip carries adminId, email, and role', () => {
  const token = issueAdminToken({ id: 1, email: 'admin@example.com' });
  const payload = verifyAdminToken(token);
  assert.equal(payload.adminId, 1);
  assert.equal(payload.email, 'admin@example.com');
  assert.equal(payload.role, 'admin');
});

test('verifyAdminToken throws on a tampered token', () => {
  const token = issueAdminToken({ id: 1, email: 'admin@example.com' });
  assert.throws(() => verifyAdminToken(`${token}tampered`));
});

test('verifyAdminToken rejects a valid customer token - the two token shapes must not be interchangeable', () => {
  const customerToken = issueToken('jane@example.com');
  assert.throws(() => verifyAdminToken(customerToken));
});

test('findAdminByEmail returns the matching row, case-insensitively', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE LOWER\(email\) = LOWER\(\$1\)/);
    assert.equal(params[0], 'Admin@Example.com');
    return { rows: [{ id: 5, email: 'admin@example.com' }] };
  });

  const { findAdminByEmail } = require('../src/services/adminAuthService');
  const admin = await findAdminByEmail('Admin@Example.com');
  assert.deepEqual(admin, { id: 5, email: 'admin@example.com' });
});

test('findAdminByEmail returns null when no row matches - an allowlist miss, not an error', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const { findAdminByEmail } = require('../src/services/adminAuthService');
  const admin = await findAdminByEmail('nobody@example.com');
  assert.equal(admin, null);
});
