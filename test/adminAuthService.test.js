const test = require('node:test');
const assert = require('node:assert/strict');
const { issueToken } = require('../src/services/authService');
const { issueAdminToken, verifyAdminToken } = require('../src/services/adminAuthService');

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
