const test = require('node:test');
const assert = require('node:assert/strict');
const { issueToken, verifyToken } = require('../src/services/authService');
const { issueAdminToken } = require('../src/services/adminAuthService');

test('issueToken/verifyToken round-trip carries the email', () => {
  const token = issueToken('jane@example.com');
  const payload = verifyToken(token);
  assert.equal(payload.email, 'jane@example.com');
});

test('verifyToken throws on a tampered token', () => {
  const token = issueToken('jane@example.com');
  assert.throws(() => verifyToken(`${token}tampered`));
});

test('verifyToken rejects a valid admin token - the two token shapes must not be interchangeable in either direction', () => {
  const adminToken = issueAdminToken({ id: 1, email: 'admin@example.com' });
  assert.throws(() => verifyToken(adminToken));
});
