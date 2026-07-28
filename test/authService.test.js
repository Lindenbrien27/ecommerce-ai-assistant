const test = require('node:test');
const assert = require('node:assert/strict');
const { issueToken, verifyToken } = require('../src/services/authService');

test('issueToken/verifyToken round-trip carries the email', () => {
  const token = issueToken('jane@example.com');
  const payload = verifyToken(token);
  assert.equal(payload.email, 'jane@example.com');
});

test('verifyToken throws on a tampered token', () => {
  const token = issueToken('jane@example.com');
  assert.throws(() => verifyToken(`${token}tampered`));
});
