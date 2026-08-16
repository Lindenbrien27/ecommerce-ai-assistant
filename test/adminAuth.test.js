const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { OAuth2Client } = require('google-auth-library');
const { issueToken } = require('../src/services/authService');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function mockGoogleEmail(t, email) {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ email, email_verified: true }),
  }));
}

test('POST /api/admin/auth/google sets an httpOnly cookie for an allowlisted admin', async (t) => {
  mockGoogleEmail(t, 'lindenbrien27@gmail.com');
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 1, email: 'lindenbrien27@gmail.com' }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'a-real-looking-id-token' }),
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'expected a Set-Cookie header');
    assert.match(setCookie, /adminToken=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/i);
    const body = await res.json();
    assert.equal(body.email, 'lindenbrien27@gmail.com');
  });
});

test('POST /api/admin/auth/google rejects a verified email that is not on the allowlist', async (t) => {
  mockGoogleEmail(t, 'not-an-admin@example.com');
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'a-real-looking-id-token' }),
    });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('POST /api/admin/auth/google rejects an invalid Google token', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
    throw new Error('Wrong number of segments in token');
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'garbage' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/auth/google returns 500 when GOOGLE_CLIENT_ID is not configured', async (t) => {
  const original = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  t.after(() => {
    if (original !== undefined) process.env.GOOGLE_CLIENT_ID = original;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'anything' }),
    });
    assert.equal(res.status, 500);
  });
});

test('GET /api/admin/auth/me returns the admin email for a valid admin cookie', async (t) => {
  const token = issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/me`, {
      headers: { Cookie: `adminToken=${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.email, 'lindenbrien27@gmail.com');
  });
});

test('GET /api/admin/auth/me rejects a request with no cookie', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/me`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/auth/me rejects a valid customer token used as an admin cookie', async (t) => {
  const customerToken = issueToken('jane@example.com');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/me`, {
      headers: { Cookie: `adminToken=${customerToken}` },
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/admin/auth/logout clears the admin cookie', async (t) => {
  const token = issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `adminToken=${token}` },
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /adminToken=;/);
  });
});

test('GET /admin/login serves the app with a relaxed CSP allowing Google Sign-In', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/admin/login`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.match(csp, /frame-src 'self' https:\/\/accounts\.google\.com/);
    // Google's gsi/client script injects its own stylesheet from this path -
    // a 'self'-only style-src blocks it outright.
    assert.match(csp, /style-src 'self' https:\/\/accounts\.google\.com\/gsi\/style/);
  });
});

test('GET /orders keeps the strict CSP - the admin override is scoped to /admin only', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/orders`);
    const csp = res.headers.get('content-security-policy');
    assert.doesNotMatch(csp, /accounts\.google\.com/);
  });
});

test('GET /admin/login relaxes COOP to allow the Google Sign-In popup fallback', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/admin/login`);
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  });
});

test('GET /orders keeps the strict default COOP - the admin override is scoped to /admin only', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/orders`);
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  });
});

// The admin-login-specific rate limit tests (POST /google trips it, GET /me
// doesn't share its budget) live in test/rateLimiter.test.js instead of
// here - node:test isolates each file into its own process, so a fresh file
// gets a fresh adminLoginLimiter counter. Kept in this file, the tests above
// (four of which already POST to /google) would eat into the same budget
// this test needs to measure precisely, an artifact of the limiter being a
// module-level singleton shared across every test in one process, same
// reasoning rateLimiter.test.js's own comments already document for
// chatLimiter/ordersLimiter/authLimiter.
