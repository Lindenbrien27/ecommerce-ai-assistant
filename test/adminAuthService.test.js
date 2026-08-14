const test = require('node:test');
const assert = require('node:assert/strict');
const { issueToken } = require('../src/services/authService');
const { issueAdminToken, verifyAdminToken } = require('../src/services/adminAuthService');
const { pool } = require('../src/config/db');
const { OAuth2Client } = require('google-auth-library');

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

test('verifyGoogleIdToken returns the email from a valid Google ID token payload', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
    assert.equal(idToken, 'a-real-looking-id-token');
    assert.equal(audience, 'test-client-id');
    return { getPayload: () => ({ email: 'admin@example.com', email_verified: true }) };
  });

  const { verifyGoogleIdToken } = require('../src/services/adminAuthService');
  const email = await verifyGoogleIdToken('a-real-looking-id-token');
  assert.equal(email, 'admin@example.com');
});

test('verifyGoogleIdToken rejects a payload with email_verified: false', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ email: 'admin@example.com', email_verified: false }),
  }));

  const { verifyGoogleIdToken } = require('../src/services/adminAuthService');
  await assert.rejects(() => verifyGoogleIdToken('a-real-looking-id-token'));
});

test('verifyGoogleIdToken rejects a payload with no email_verified claim at all', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ email: 'admin@example.com' }),
  }));

  const { verifyGoogleIdToken } = require('../src/services/adminAuthService');
  await assert.rejects(() => verifyGoogleIdToken('a-real-looking-id-token'));
});

test('verifyGoogleIdToken propagates a rejection from google-auth-library on an invalid token', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
    throw new Error('Wrong number of segments in token');
  });

  const { verifyGoogleIdToken } = require('../src/services/adminAuthService');
  await assert.rejects(() => verifyGoogleIdToken('not-a-real-token'));
});

test('isGoogleAuthConfigured reflects whether GOOGLE_CLIENT_ID is set', () => {
  const original = process.env.GOOGLE_CLIENT_ID;
  const { isGoogleAuthConfigured } = require('../src/services/adminAuthService');

  delete process.env.GOOGLE_CLIENT_ID;
  assert.equal(isGoogleAuthConfigured(), false);

  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  assert.equal(isGoogleAuthConfigured(), true);

  if (original === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = original;
});
