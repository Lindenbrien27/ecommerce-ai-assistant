# Admin Login (Google OAuth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one seeded admin sign in with their Google account and reach a protected `/admin` route, fully independent of the existing customer OTP auth.

**Architecture:** A second, parallel auth track: a plain `admins` allowlist table (email only, no password), a Google Identity Services ID-token POST flow verified server-side with `google-auth-library`, and an httpOnly-cookie session distinct from the customer app's `sessionStorage` token. Backend follows this repo's existing routes → controllers → services → `pool.query` layering exactly (mirrors `authRoutes.js`/`authController.js`/`otpService.js`). Frontend follows the existing `AuthContext.jsx`/`ProtectedRoute.jsx` pattern, duplicated as `AdminAuthContext.jsx`/`AdminProtectedRoute.jsx` rather than generalizing both auth systems into one, since they intentionally don't share a trust boundary.

**Tech Stack:** Express + `pg` (raw SQL, no ORM), `node-pg-migrate`, `google-auth-library` (new), `cookie-parser` (new), `express-rate-limit`, React Router v6, `node:test`/`node:assert` (backend), Vitest + Testing Library (frontend).

## Global Constraints

- **Dev-minimal fidelity.** One seeded admin, no self-serve signup, no invite flow, no password auth anywhere in this system.
- **`admins` table has no `password_hash` column.** Google proves identity; being a row in this table is what makes someone an admin.
- **Admin JWT is a distinct shape from the customer JWT** — `{ adminId, email, role: 'admin' }`, 30 minute TTL (vs. the customer token's 1 hour, `authService.js`). `verifyAdminToken` must reject a valid customer token and vice versa.
- **Session is an httpOnly, `Secure` (prod only), `SameSite=Lax` cookie** — not `sessionStorage`. `AdminProtectedRoute` determines auth state via `GET /api/admin/auth/me`, never by reading a token client-side.
- **No enumeration beyond what Google already reveals.** `POST /api/admin/auth/google` returns 403 "Not authorized" for a verified-but-not-allowlisted email — this is fine (unlike the customer OTP flow's stricter no-enumeration rule) because the caller already proved they own that real Google-verified email; there's no guessing surface left to protect.
- **CSP stays strict everywhere except `/admin*`.** `securityHeaders.js`'s existing policy (`script-src 'self'`, no `frame-src` override) blocks Google's sign-in script/iframe outright. The relaxed policy is scoped to a `/admin*` route registered before the SPA catch-all, mirroring the existing `apiDocsStyleOverride` pattern exactly.
- **`GOOGLE_CLIENT_ID` is not a required env var** (not added to `requiredEnv.js`) — missing it degrades `POST /api/admin/auth/google` to a clear 500, same "convenient in dev, doesn't crash the app" pattern as `ANTHROPIC_API_KEY`/SMTP.
- **Manual, non-code step:** registering the OAuth Client ID in Google Cloud Console and setting `GOOGLE_CLIENT_ID` (backend) + `VITE_GOOGLE_CLIENT_ID` (frontend build) is the developer's own action — call this out explicitly in Task 8, don't attempt to script it.
- **The actual Catalog Admin panel (product CRUD, promos, stock) is out of scope.** `/admin` renders a minimal placeholder proving the login → protected-route → session round-trip works; the real panel is a separate future plan.

---

### Task 1: Migration — `admins` table

**Files:**
- Create: `migrations/<timestamp>_add-admins-table.sql`

**Interfaces:**
- Produces: table `admins(id, email, created_at)`, consumed by Task 3's `findAdminByEmail`.

- [ ] **Step 1: Generate the migration file**

Run: `npm run migrate:create -- add-admins-table`

This creates `migrations/<new-timestamp>_add-admins-table.sql` with empty `-- Up Migration`/`-- Down Migration` sections, matching every existing file in `migrations/`.

- [ ] **Step 2: Write the migration**

Replace the generated file's contents with:

```sql
-- Up Migration

-- Email-only allowlist, no password column - Google Sign-In (see
-- adminAuthService.js) is what proves identity; being a row here is what
-- makes an email an admin. Seeded with the app owner's own real inbox
-- (lindenbrien27@gmail.com) rather than a throwaway dev@example.com the
-- way other seed migrations do (see 1785631599842_add-dev-seed-account.sql)
-- - Google OAuth requires signing into a real Google account, so a fake
-- address wouldn't actually be usable here.
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admins (email) VALUES ('lindenbrien27@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Down Migration

DROP TABLE admins;
```

- [ ] **Step 3: Apply the migration**

Run: `npm run migrate:up`

Expected: output ends with `Migrations complete!` and no errors. Requires `DATABASE_URL` to be set in your environment (via Doppler or `.env` — see README > Secrets management).

- [ ] **Step 4: Commit**

```bash
git add migrations/
git commit -m "Add admins allowlist table, seeded with the app owner's account"
```

---

### Task 2: `adminAuthService` — admin JWT issue/verify

**Files:**
- Create: `src/services/adminAuthService.js`
- Test: `test/adminAuthService.test.js`

**Interfaces:**
- Consumes: `process.env.JWT_SECRET` (already required by `requiredEnv.js`)
- Produces: `issueAdminToken(admin: { id, email }): string`, `verifyAdminToken(token: string): { adminId, email, role }` (throws on invalid/tampered/wrong-role token), `ADMIN_TOKEN_TTL` — consumed by Task 5's controller and middleware.

- [ ] **Step 1: Install new backend dependencies**

Run: `npm install google-auth-library cookie-parser`

- [ ] **Step 2: Write the failing test**

Create `test/adminAuthService.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/adminAuthService.test.js`
Expected: FAIL with "Cannot find module '../src/services/adminAuthService'"

- [ ] **Step 4: Write the implementation**

Create `src/services/adminAuthService.js`:

```js
const jwt = require('jsonwebtoken');

// Half the customer token's 1h TTL (authService.js) - an admin session is a
// higher-value target (can edit the catalog), so it stays valid for a
// shorter window even though nothing here can revoke it early once issued.
const ADMIN_TOKEN_TTL = '30m';

function issueAdminToken(admin) {
  return jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

// Throws on anything wrong with the token, same "throws, caller catches"
// contract authService.js's verifyToken already uses. The role check is
// what keeps a customer token (a structurally valid JWT signed with the
// same JWT_SECRET) from ever satisfying requireAdminAuth.
function verifyAdminToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload.role !== 'admin') {
    throw new Error('Not an admin token');
  }
  return payload;
}

module.exports = { issueAdminToken, verifyAdminToken, ADMIN_TOKEN_TTL };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/adminAuthService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/services/adminAuthService.js test/adminAuthService.test.js
git commit -m "Add admin JWT issue/verify, distinct from the customer token shape"
```

---

### Task 3: `adminAuthService` — `findAdminByEmail`

**Files:**
- Modify: `src/services/adminAuthService.js`
- Modify: `test/adminAuthService.test.js`

**Interfaces:**
- Consumes: `pool` from `src/config/db.js`, table `admins` (Task 1)
- Produces: `findAdminByEmail(email: string): Promise<{ id, email } | null>` — consumed by Task 5's controller.

- [ ] **Step 1: Write the failing tests**

Append to `test/adminAuthService.test.js` (add the import at the top alongside the existing ones):

```js
const { pool } = require('../src/config/db');
```

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/adminAuthService.test.js`
Expected: FAIL - `findAdminByEmail is not a function`

- [ ] **Step 3: Implement `findAdminByEmail`**

Add to `src/services/adminAuthService.js` (near the top, after the `jwt` require):

```js
const { pool } = require('../config/db');
```

Add near the bottom, before `module.exports`:

```js
async function findAdminByEmail(email) {
  const { rows } = await pool.query('SELECT id, email FROM admins WHERE LOWER(email) = LOWER($1)', [email]);
  return rows[0] || null;
}
```

Update the export line:

```js
module.exports = { issueAdminToken, verifyAdminToken, findAdminByEmail, ADMIN_TOKEN_TTL };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/adminAuthService.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/adminAuthService.js test/adminAuthService.test.js
git commit -m "Add findAdminByEmail lookup against the admins allowlist"
```

---

### Task 4: `adminAuthService` — Google ID token verification

**Files:**
- Modify: `src/services/adminAuthService.js`
- Modify: `test/adminAuthService.test.js`

**Interfaces:**
- Consumes: `process.env.GOOGLE_CLIENT_ID`, `google-auth-library`'s `OAuth2Client`
- Produces: `verifyGoogleIdToken(idToken: string): Promise<string>` (resolves to the verified email, throws on an invalid token), `isGoogleAuthConfigured(): boolean` — consumed by Task 5's controller.

- [ ] **Step 1: Write the failing tests**

Append to `test/adminAuthService.test.js`:

```js
const { OAuth2Client } = require('google-auth-library');
```

```js
test('verifyGoogleIdToken returns the email from a valid Google ID token payload', async (t) => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
    assert.equal(idToken, 'a-real-looking-id-token');
    assert.equal(audience, 'test-client-id');
    return { getPayload: () => ({ email: 'admin@example.com' }) };
  });

  const { verifyGoogleIdToken } = require('../src/services/adminAuthService');
  const email = await verifyGoogleIdToken('a-real-looking-id-token');
  assert.equal(email, 'admin@example.com');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/adminAuthService.test.js`
Expected: FAIL - `verifyGoogleIdToken is not a function`

- [ ] **Step 3: Implement Google ID token verification**

Add to `src/services/adminAuthService.js`, near the top:

```js
const { OAuth2Client } = require('google-auth-library');
```

Add near the bottom, before `module.exports`:

```js
// Same "isConfigured() lets the caller decide" shape as emailService.js's
// SMTP check - a missing GOOGLE_CLIENT_ID degrades POST /api/admin/auth/google
// to a clear 500 (see adminAuthController.js) instead of the app failing to
// start, since nothing else in this app depends on it.
function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

let googleClient = null;
function getGoogleClient() {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

// Throws if the token's signature, audience, or expiry don't check out -
// callers are expected to catch this, the same "throws, caller catches"
// contract verifyToken/verifyAdminToken above already use. audience is
// re-read from process.env at call time (not captured at client-construction
// time), so a test that sets GOOGLE_CLIENT_ID after this module first loads
// still gets checked against the current value.
async function verifyGoogleIdToken(idToken) {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload().email;
}
```

Update the export line:

```js
module.exports = {
  issueAdminToken,
  verifyAdminToken,
  findAdminByEmail,
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  ADMIN_TOKEN_TTL,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/adminAuthService.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/adminAuthService.js test/adminAuthService.test.js
git commit -m "Add Google ID token verification to adminAuthService"
```

---

### Task 5: Backend wiring — middleware, controller, routes, limiter, CSP, `app.js`

**Files:**
- Create: `src/middleware/adminAuth.js`
- Create: `src/controllers/adminAuthController.js`
- Create: `src/routes/adminAuthRoutes.js`
- Modify: `src/middleware/rateLimiter.js`
- Modify: `src/middleware/securityHeaders.js`
- Modify: `src/app.js`
- Modify: `.env.example`
- Modify: `package.json` (test script env vars)
- Test: `test/adminAuth.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2-4 (`adminAuthService`)
- Produces: `requireAdminAuth` middleware (sets `req.adminId`/`req.adminEmail`), `POST /api/admin/auth/google`, `GET /api/admin/auth/me`, `POST /api/admin/auth/logout`, `adminLoginLimiter`, `adminCspOverride` — consumed by Task 8's frontend routing and any future admin-panel backend work.

- [ ] **Step 1: Write the failing route tests**

Create `test/adminAuth.test.js`:

```js
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
    getPayload: () => ({ email }),
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
  });
});

test('GET /orders keeps the strict CSP - the admin override is scoped to /admin only', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/orders`);
    const csp = res.headers.get('content-security-policy');
    assert.doesNotMatch(csp, /accounts\.google\.com/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/adminAuth.test.js`
Expected: FAIL - `fetch failed` / 404s, since none of the routes exist yet.

- [ ] **Step 3: Implement `requireAdminAuth`**

Create `src/middleware/adminAuth.js`:

```js
const { verifyAdminToken } = require('../services/adminAuthService');
const { auditLog } = require('../config/auditLog');

// Reads the httpOnly cookie (see adminAuthController.js), not an
// Authorization header - unlike requireCustomerAuth, the admin token is
// never exposed to frontend JS at all, so there's nothing for a client to
// put in a header.
function requireAdminAuth(req, res, next) {
  const token = req.cookies && req.cookies.adminToken;

  if (!token) {
    auditLog('admin.auth.token_rejected', { reason: 'missing', path: req.originalUrl, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifyAdminToken(token);
    req.adminId = payload.adminId;
    req.adminEmail = payload.email;
    next();
  } catch (err) {
    auditLog('admin.auth.token_rejected', {
      reason: err.name === 'TokenExpiredError' ? 'expired' : 'invalid',
      path: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireAdminAuth };
```

- [ ] **Step 4: Implement the controller**

Create `src/controllers/adminAuthController.js`:

```js
const {
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  findAdminByEmail,
  issueAdminToken,
} = require('../services/adminAuthService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const ADMIN_COOKIE_NAME = 'adminToken';
// Matches adminAuthService's ADMIN_TOKEN_TTL (30m) - the cookie shouldn't
// outlive the JWT it carries.
const ADMIN_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_COOKIE_MAX_AGE_MS,
  };
}

// Unlike requestOtpHandler's deliberate "always the same response" shape
// (authController.js), a 403 here is fine and doesn't need to be
// enumeration-safe: the caller already proved they own a real email via a
// Google-signed token before this branch is ever reached, so there's no
// guessing surface a 403-vs-200 distinction could leak.
async function googleLoginHandler(req, res) {
  if (!isGoogleAuthConfigured()) {
    return res.status(500).json({ error: 'Admin login is not configured.' });
  }

  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required.' });
  }

  let email;
  try {
    email = await verifyGoogleIdToken(idToken);
  } catch (err) {
    auditLog('admin.auth.google_token_rejected', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid Google sign-in.' });
  }

  try {
    const admin = await findAdminByEmail(email);
    if (!admin) {
      auditLog('admin.auth.not_allowlisted', { email: email.toLowerCase(), ip: req.ip });
      return res.status(403).json({ error: 'Not authorized.' });
    }

    auditLog('admin.auth.login_succeeded', { email: admin.email.toLowerCase(), ip: req.ip });
    const token = issueAdminToken(admin);
    res.cookie(ADMIN_COOKIE_NAME, token, adminCookieOptions());
    res.json({ email: admin.email });
  } catch (err) {
    logError('Admin login error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

function meHandler(req, res) {
  res.json({ email: req.adminEmail });
}

function logoutHandler(req, res) {
  res.clearCookie(ADMIN_COOKIE_NAME, adminCookieOptions());
  res.json({ ok: true });
}

module.exports = { googleLoginHandler, meHandler, logoutHandler, ADMIN_COOKIE_NAME };
```

- [ ] **Step 5: Implement the router**

Create `src/routes/adminAuthRoutes.js`:

```js
const { Router } = require('express');
const { googleLoginHandler, meHandler, logoutHandler } = require('../controllers/adminAuthController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = Router();

router.post('/google', googleLoginHandler);
router.get('/me', requireAdminAuth, meHandler);
router.post('/logout', requireAdminAuth, logoutHandler);

module.exports = router;
```

- [ ] **Step 6: Add the admin login rate limiter**

In `src/middleware/rateLimiter.js`, add after the existing `authLimiter` definition:

```js
// Tighter than authLimiter above - a compromised admin account is worth
// more to an attacker than one customer's order history, and this endpoint
// accepts arbitrary Google ID tokens before any allowlist check runs.
const adminLoginLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS) || 15 * 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
  handler: auditedHandler('admin_login'),
});
```

Update the final export line to:

```js
module.exports = { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter };
```

- [ ] **Step 7: Add the admin CSP override**

In `src/middleware/securityHeaders.js`, add after `apiDocsStyleOverride`:

```js
// Scoped to /admin* only - the Google Sign-In button that route renders
// loads a script and iframe from accounts.google.com, which the strict
// default CSP above (script-src/frame-src both implicitly fall back to
// default-src 'self') blocks outright. Every other route keeps the strict
// policy untouched, same scoping approach as apiDocsStyleOverride above.
// This only matters for whichever URL the browser tab was actually loaded
// from - React Router's client-side navigation never issues a fresh HTTP
// request, so a tab that started on a customer page keeps that page's
// original (strict) CSP even after navigating to /admin/login in-app.
// There is no in-app link to /admin anywhere in the customer UI, so this
// is reached by direct URL entry only, which is what makes the override
// apply correctly in practice.
const adminCspOverride = helmet.contentSecurityPolicy({
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'style-src': ["'self'"],
    'font-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
    'frame-src': ["'self'", 'https://accounts.google.com'],
    'connect-src': ["'self'", 'https://accounts.google.com'],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  },
});
```

Update the final export line to:

```js
module.exports = { securityHeaders, apiDocsStyleOverride, adminCspOverride };
```

- [ ] **Step 8: Wire everything into `app.js`**

In `src/app.js`, update the requires near the top:

```js
const orderRoutes = require('./routes/orderRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const cookieParser = require('cookie-parser');
const { requireCustomerAuth } = require('./middleware/customerAuth');
const { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter } = require('./middleware/rateLimiter');
const { enforceHttps } = require('./middleware/httpsEnforce');
const { securityHeaders, apiDocsStyleOverride, adminCspOverride } = require('./middleware/securityHeaders');
```

After `app.use(express.json());`, add:

```js
app.use(cookieParser());
```

After the existing `app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);` line, add:

```js
app.use('/api/admin/auth', adminLoginLimiter, adminAuthRoutes);
```

Immediately **before** the existing SPA fallback (`app.get('*', (req, res) => { ... });`), add:

```js
// Same index.html every other client route gets (see the fallback just
// below), but with the relaxed CSP the admin login page's Google Sign-In
// button needs (see adminCspOverride's own comment). Must be registered
// before the generic '*' fallback below - Express matches routes in
// registration order, and the generic one would otherwise catch /admin
// first and serve it with the strict default policy instead.
app.get(['/admin', '/admin/*'], adminCspOverride, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML);
});
```

- [ ] **Step 9: Add test-only env vars for the new rate limiter**

In `package.json`, update the `test` script to include the two new env vars, matching the existing `RATE_LIMIT_AUTH_*` pattern:

```json
"test": "ANTHROPIC_API_KEY=test-key-for-ci DATABASE_URL=postgresql://test:test@localhost:5432/test JWT_SECRET=test-secret-for-ci RATE_LIMIT_MAX=20 RATE_LIMIT_WINDOW_MS=60000 RATE_LIMIT_ORDERS_MAX=20 RATE_LIMIT_ORDERS_WINDOW_MS=60000 RATE_LIMIT_AUTH_MAX=20 RATE_LIMIT_AUTH_WINDOW_MS=60000 RATE_LIMIT_ADMIN_LOGIN_MAX=20 RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS=60000 LOG_LEVEL=silent node --test",
```

- [ ] **Step 10: Document the new env vars**

In `.env.example`, add after the existing `RATE_LIMIT_AUTH_*` block:

```
# Optional - required only for the admin panel's Google Sign-In (POST /api/admin/auth/google).
# The same OAuth Client ID value also goes in frontend/.env's VITE_GOOGLE_CLIENT_ID - Google
# Client IDs are public identifiers, not secrets, so this is safe to duplicate rather than share
# at build time. Left blank, admin login returns a clear 500 instead of the app failing to start
# - same degrades-gracefully pattern as ANTHROPIC_API_KEY above.
GOOGLE_CLIENT_ID=

# Optional - defaults to 5 requests per 15 minutes per client if unset
RATE_LIMIT_ADMIN_LOGIN_MAX=
RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS=
```

- [ ] **Step 11: Run the full backend test suite**

Run: `npm test`
Expected: PASS, all files including `test/adminAuthService.test.js` and `test/adminAuth.test.js`

- [ ] **Step 12: Commit**

```bash
git add src/middleware/adminAuth.js src/controllers/adminAuthController.js src/routes/adminAuthRoutes.js \
  src/middleware/rateLimiter.js src/middleware/securityHeaders.js src/app.js \
  package.json .env.example test/adminAuth.test.js
git commit -m "Wire up admin login: middleware, routes, rate limit, and scoped CSP exception"
```

---

### Task 6: Frontend — `AdminAuthContext` and `AdminProtectedRoute`

**Files:**
- Create: `frontend/src/context/AdminAuthContext.jsx`
- Create: `frontend/src/components/AdminProtectedRoute.jsx`
- Test: `frontend/src/components/AdminProtectedRoute.test.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/auth/me`, `POST /api/admin/auth/logout` (Task 5)
- Produces: `AdminAuthProvider`, `useAdminAuth(): { email, checked, login(email), logout() }`, `AdminProtectedRoute` — consumed by Task 7's login form and Task 8's routing.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/AdminProtectedRoute.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProtectedRoute } from './AdminProtectedRoute.jsx';

function renderAt(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/login" element={<div>admin login page</div>} />
          <Route element={<AdminProtectedRoute />}>
            <Route path="/admin" element={<div>admin dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('AdminProtectedRoute', () => {
  it('redirects to /admin/login when the session check comes back unauthenticated', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    renderAt('/admin');
    expect(await screen.findByText('admin login page')).toBeInTheDocument();
  });

  it('renders the protected route when the session check succeeds', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    renderAt('/admin');
    expect(await screen.findByText('admin dashboard')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend test -- AdminProtectedRoute`
Expected: FAIL - cannot find module `../context/AdminAuthContext.jsx`

- [ ] **Step 3: Implement `AdminAuthContext`**

Create `frontend/src/context/AdminAuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';

const AdminAuthContext = createContext(null);

// No token lives here at all - the admin session is an httpOnly cookie
// (see adminAuthController.js), unreadable to this or any other script by
// design. checked distinguishes "still finding out" from "confirmed
// logged out" so AdminProtectedRoute doesn't redirect during the brief
// window before the /me request resolves on first load.
export function AdminAuthProvider({ children }) {
  const [email, setEmail] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setEmail(data ? data.email : null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function login(newEmail) {
    setEmail(newEmail);
  }

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setEmail(null);
  }

  return <AdminAuthContext.Provider value={{ email, checked, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Implement `AdminProtectedRoute`**

Create `frontend/src/components/AdminProtectedRoute.jsx`:

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminProtectedRoute() {
  const { email, checked } = useAdminAuth();
  if (!checked) return null;
  if (!email) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix frontend test -- AdminProtectedRoute`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/context/AdminAuthContext.jsx frontend/src/components/AdminProtectedRoute.jsx \
  frontend/src/components/AdminProtectedRoute.test.jsx
git commit -m "Add AdminAuthContext and AdminProtectedRoute, session-checked via /me"
```

---

### Task 7: Frontend — `AdminLoginForm` and `AdminLoginPage`

**Files:**
- Create: `frontend/src/components/AdminLoginForm.jsx`
- Create: `frontend/src/components/AdminLoginForm.test.jsx`
- Create: `frontend/src/pages/AdminLoginPage.jsx`

**Interfaces:**
- Consumes: `useAdminAuth()` (Task 6), `POST /api/admin/auth/google` (Task 5)
- Produces: `AdminLoginForm`, `handleGoogleCredential(response, { login, navigate })` (exported for direct testing), `AdminLoginPage` — consumed by Task 8's routing.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/AdminLoginForm.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGoogleCredential } from './AdminLoginForm.jsx';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('handleGoogleCredential', () => {
  it('posts the Google credential, logs in, and navigates to /admin on success', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    const login = vi.fn();
    const navigate = vi.fn();

    const result = await handleGoogleCredential({ credential: 'fake-id-token' }, { login, navigate });

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/auth/google',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'fake-id-token' }) })
    );
    expect(login).toHaveBeenCalledWith('admin@example.com');
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('does not log in or navigate when the backend rejects the credential', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Not authorized.' }) });
    const login = vi.fn();
    const navigate = vi.fn();

    const result = await handleGoogleCredential({ credential: 'fake-id-token' }, { login, navigate });

    expect(result).toBe(false);
    expect(login).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend test -- AdminLoginForm`
Expected: FAIL - cannot find module `./AdminLoginForm.jsx`

- [ ] **Step 3: Implement `AdminLoginForm`**

Create `frontend/src/components/AdminLoginForm.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

// Split out from the useEffect below so it's directly testable without
// Google's real script, which never loads in a jsdom test environment -
// login/navigate are passed in rather than closed over so a test can
// supply plain vi.fn() spies instead of rendering through
// AdminAuthProvider + MemoryRouter just to get real ones. Returns whether
// login succeeded, purely so the test above has something to assert on.
export async function handleGoogleCredential(response, { login, navigate }) {
  const res = await fetch('/api/admin/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: response.credential }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  login(data.email);
  navigate('/admin');
  return true;
}

export function AdminLoginForm() {
  const buttonRef = useRef(null);
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    loadGsiScript().then(() => {
      if (cancelled || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (response) => handleGoogleCredential(response, { login, navigate }),
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={buttonRef} data-testid="google-signin-button" />;
}
```

- [ ] **Step 4: Implement `AdminLoginPage`**

Create `frontend/src/pages/AdminLoginPage.jsx`:

```jsx
import { AdminLoginForm } from '../components/AdminLoginForm.jsx';

export function AdminLoginPage() {
  return (
    <div className="admin-login-root">
      <div className="admin-login-card">
        <h1>Admin sign in</h1>
        <p className="subtitle">Sign in with the Google account on this catalog's admin allowlist.</p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix frontend test -- AdminLoginForm`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AdminLoginForm.jsx frontend/src/components/AdminLoginForm.test.jsx \
  frontend/src/pages/AdminLoginPage.jsx
git commit -m "Add AdminLoginForm (Google Sign-In) and AdminLoginPage"
```

---

### Task 8: Frontend routing, placeholder dashboard, and manual end-to-end verification

**Files:**
- Create: `frontend/src/pages/AdminDashboardPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/index.css` (append-only, matching how `AnimatedList` styles were added)

**Interfaces:**
- Consumes: `AdminAuthProvider`/`AdminProtectedRoute` (Task 6), `AdminLoginPage` (Task 7)
- Produces: working `/admin/login` and `/admin` routes.

- [ ] **Step 1: Implement the placeholder dashboard**

Create `frontend/src/pages/AdminDashboardPage.jsx`:

```jsx
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

// Placeholder only - the real Catalog Admin panel (product CRUD, promo
// assignment, stock) is explicitly out of scope for this plan (see
// docs/superpowers/specs/2026-08-14-admin-login-design.md > Non-goals).
// This page exists to prove the login -> protected route -> session
// round-trip actually works end to end before any of that gets built.
export function AdminDashboardPage() {
  const { email, logout } = useAdminAuth();
  return (
    <div className="admin-login-root">
      <div className="admin-login-card">
        <h1>Admin dashboard</h1>
        <p className="subtitle">Signed in as {email}.</p>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styles**

Append to `frontend/src/index.css`:

```css
/* Shared shell for the admin-only pages (AdminLoginPage/AdminDashboardPage)
   - deliberately its own small block, not reusing .verify-*'s customer
   auth styles, since the two auth systems don't share a trust boundary
   and shouldn't visually imply they're the same flow. */
.admin-login-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-page-bg);
}

.admin-login-card {
  width: min(360px, calc(100vw - 2.5rem));
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card-resting);
  padding: var(--space-4);
  text-align: center;
}

.admin-login-card h1 {
  margin: 0 0 0.35rem;
  font-size: var(--font-size-lg);
}
```

- [ ] **Step 3: Wire the routes into `App.jsx`**

In `frontend/src/App.jsx`, update the `react-router-dom` import to include `Outlet`:

```jsx
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
```

Add new imports after the existing lazy page imports:

```jsx
import { AdminAuthProvider } from './context/AdminAuthContext.jsx';
import { AdminProtectedRoute } from './components/AdminProtectedRoute.jsx';
```

Add two new lazy-loaded pages alongside the existing ones:

```jsx
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage.jsx').then((m) => ({ default: m.AdminLoginPage })));
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage.jsx').then((m) => ({ default: m.AdminDashboardPage }))
);
```

Inside `<Routes>`, add a new top-level `/admin/*` branch, as a sibling of the existing `<Route element={<PublicOnlyRoute />}>` and `<Route element={<ProtectedRoute />}>` blocks - **not** nested inside either, since it has its own independent auth provider:

```jsx
<Route
  path="/admin/*"
  element={
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  }
>
  <Route path="login" element={<AdminLoginPage />} />
  <Route element={<AdminProtectedRoute />}>
    <Route index element={<AdminDashboardPage />} />
  </Route>
</Route>
```

- [ ] **Step 4: Run the full frontend test suite**

Run: `npm --prefix frontend test`
Expected: PASS, no regressions in existing `ProtectedRoute.test.jsx`/`PublicOnlyRoute.test.jsx` etc.

- [ ] **Step 5: Run the full backend test suite one more time**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit the code**

```bash
git add frontend/src/pages/AdminDashboardPage.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "Wire /admin/login and /admin routes into the app"
```

- [ ] **Step 7: Manual setup — Google Cloud Console (developer action, not scriptable)**

This step cannot be automated by an agentic worker - it requires the developer's own Google account:

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Go to **APIs & Services → OAuth consent screen**. Choose **External**, leave it in **Testing** mode, fill in app name/support email, and add the seeded admin email (`lindenbrien27@gmail.com`) as a test user.
3. Go to **Credentials → Create Credentials → OAuth client ID**, type **Web application**. Add `http://localhost:5173` (Vite dev) and your production origin to **Authorized JavaScript origins**. No redirect URI is needed - this app uses the ID-token POST flow, not a server redirect.
4. Copy the generated **Client ID**.
5. Set `GOOGLE_CLIENT_ID=<client id>` in your backend env (Doppler or `.env`).
6. Set `VITE_GOOGLE_CLIENT_ID=<same client id>` in `frontend/.env` (create it if it doesn't exist - see `frontend/vite.config.js` for how the dev server proxies `/api`).

- [ ] **Step 8: Manual end-to-end verification in a real browser**

1. Run the backend: `npm run dev` (from repo root).
2. Run the frontend: `npm --prefix frontend run dev`.
3. Navigate directly to `http://localhost:5173/admin/login` (must be a fresh URL entry, not a client-side link - see the CSP override's own comment in `securityHeaders.js` for why).
4. Confirm the Google Sign-In button actually renders - if it doesn't, open the browser console first: this is the one integration point the plan flagged as a real risk (`Cross-Origin-Embedder-Policy: require-corp` vs. Google's iframe, see the design spec's own "Known risk to verify" note). If it's blocked, the fix is loosening `crossOriginEmbedderPolicy` to `'credentialless'` specifically inside `adminCspOverride` in `securityHeaders.js`.
5. Sign in with the seeded admin's Google account. Confirm it lands on `/admin` showing "Signed in as lindenbrien27@gmail.com."
6. Click **Log out**, confirm it redirects back to `/admin/login`.
7. Try signing in with a *different* Google account (any personal account not in the `admins` table). Confirm it's rejected (stays on the login page / shows a 403 in the network tab), proving the allowlist actually gates access.

- [ ] **Step 9: Final commit if Step 7's console setup required any code changes**

Only if Step 7 surfaced a real fix (e.g. the `crossOriginEmbedderPolicy` adjustment from Step 8.4):

```bash
git add src/middleware/securityHeaders.js
git commit -m "Fix Google Sign-In iframe blocked by strict COEP on /admin"
```

---

## Self-Review

**Spec coverage:** Every section of `docs/superpowers/specs/2026-08-14-admin-login-design.md` maps to a task - data model (Task 1), Google auth mechanism (Tasks 2-5), session/cookie (Tasks 5-6), CSP exception (Task 5, verified in Task 8), backend file list (Task 5), frontend file list (Tasks 6-8), error handling (tested throughout Task 5), testing (every task is TDD). The one open item the spec itself flagged as unresolved - COEP vs. Google's iframe - is carried into Task 8 as an explicit manual verification step with its documented fix, not silently dropped.

**Placeholder scan:** No TBD/TODO; every step has real, complete code.

**Type/name consistency:** `issueAdminToken`/`verifyAdminToken`/`findAdminByEmail`/`verifyGoogleIdToken`/`isGoogleAuthConfigured` are defined once in Tasks 2-4 and referenced with those exact names in Task 5's controller. `requireAdminAuth` (Task 5) sets `req.adminId`/`req.adminEmail`, and Task 5's `meHandler` reads `req.adminEmail` - consistent. `AdminAuthProvider`/`useAdminAuth`/`AdminProtectedRoute` (Task 6) are imported by those exact names in Task 8's `App.jsx` wiring. `handleGoogleCredential` (Task 7) is exported and consumed both by its own test and by `AdminLoginForm`'s internal callback.
