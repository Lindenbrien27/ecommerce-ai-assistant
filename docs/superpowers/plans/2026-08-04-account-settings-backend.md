# Account Settings Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mocked/disabled Profile, Address, and Payment Method fields in the account-settings design artifact with a real, working feature — new database tables, backend endpoints, and frontend pages that actually save a customer's own data.

**Architecture:** Three new tables (`customer_profiles`, `customer_addresses`, `customer_payment_methods`), each a single row per customer keyed directly by `email` (no separate id, no ownership-check needed — the row a customer can act on is always their own, the same "no parameter through which another customer's data could be requested" pattern `GET /api/orders` already uses). One service file, one controller file, one router, mounted at `/api/account/*` behind the existing `requireCustomerAuth` middleware. Three new React pages replace three `ComingSoonPage` routes (`/address`, `/payment`) and add one new one (`/profile`).

**Tech Stack:** Express + `pg` (raw SQL, no ORM), `node-pg-migrate`, React Router v6, the existing `useAuthorizedFetch` hook. No new dependencies.

## Global Constraints

- **No raw payment data ever stored.** `customer_payment_methods` persists only `brand`, `last4` (4 digits), `expiry_month`, `expiry_year`, `billing_name` — never a full card number or CVV. The frontend form only collects the fields that are actually persisted; it does not present a full card-number/CVV input that would then be silently discarded, since collecting data this app never stores would itself be dishonest UI (this app has no real payment processor integration).
- **Photo is a URL field, not a file upload.** The account-settings design reference used a file-upload component, but this app has no upload infrastructure (no multer, no object storage) and none is being added for this feature. `customer_profiles.photo_url` is a plain validated `http(s)://` URL text field.
- **Role options are exactly `devops`, `customer service`, `HR`, `security`, `admin`** — the five values specified twice in the original design brief. Noting once more before implementation: these read as internal-staff role names on a customer-facing settings page, not something a shopper would naturally pick. Proceeding with the literal list as specified rather than silently substituting different options.
- **Single record per resource, not a list.** One address, one saved payment method per customer (`email` is the primary key on both tables) — a `PUT` upserts it, a `DELETE` clears it. Neither the original brief nor the design artifact called for multiple saved addresses/cards, so a list/CRUD UI would be scope beyond what was asked for.
- **`req.customerEmail` is treated as untrusted-casing input**, even though every current caller of `issueToken` happens to lowercase the email first (`src/controllers/authController.js:79`). That's an external guarantee this service layer doesn't control, so every query normalizes with `email.toLowerCase()` in the service layer rather than assuming the JWT payload is already lowercase.
- **No caching layer** for these endpoints (unlike `orderCache`). Settings are read rarely per session relative to orders; adding an LRU cache here is unwarranted complexity for the traffic this feature will actually see.
- **`GET` never 404s.** Unlike order lookups, a customer's profile/address/payment-method conceptually always exists for them, just possibly empty. `GET` returns a 200 with all-null fields when no row has been saved yet, never a 404.

---

### Task 1: Migration — account settings tables

**Files:**
- Create: `migrations/<timestamp>_add-account-settings-tables.sql` (use `npm run migrate:create -- add-account-settings-tables` to get a real timestamp prefix matching this repo's convention)

**Interfaces:**
- Produces: tables `customer_profiles`, `customer_addresses`, `customer_payment_methods`, each with `email TEXT PRIMARY KEY` and an `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` column, consumed by Task 2's `accountService.js`.

- [ ] **Step 1: Generate the migration file**

Run: `npm run migrate:create -- add-account-settings-tables`

This creates `migrations/<new-timestamp>_add-account-settings-tables.sql` with empty `-- Up Migration` / `-- Down Migration` sections, matching every existing file in `migrations/`.

- [ ] **Step 2: Write the migration**

Replace the generated file's contents with:

```sql
-- Up Migration

CREATE TABLE customer_profiles (
  email TEXT PRIMARY KEY,
  name TEXT,
  username TEXT,
  role TEXT CHECK (role IS NULL OR role IN ('devops', 'customer service', 'HR', 'security', 'admin')),
  bio TEXT,
  photo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_addresses (
  email TEXT PRIMARY KEY,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL,
  phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_payment_methods (
  email TEXT PRIMARY KEY,
  brand TEXT NOT NULL CHECK (brand IN ('Visa', 'Mastercard', 'Amex', 'Discover')),
  last4 TEXT NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  expiry_month INT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year INT NOT NULL,
  billing_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE customer_payment_methods;
DROP TABLE customer_addresses;
DROP TABLE customer_profiles;
```

- [ ] **Step 3: Run the migration locally and verify**

Run: `npm run migrate:up`
Expected: three `CREATE TABLE` lines in the migrator's output, no errors.

Run: `psql "$DATABASE_URL" -c "\d customer_profiles" -c "\d customer_addresses" -c "\d customer_payment_methods"` (or the equivalent in your Postgres client)
Expected: all three tables exist with the columns above.

- [ ] **Step 4: Commit**

```bash
git add migrations/
git commit -m "Add customer_profiles, customer_addresses, customer_payment_methods tables"
```

---

### Task 2: `accountService.js` — data access layer

**Files:**
- Create: `src/services/accountService.js`
- Test: `test/accountService.test.js`

**Interfaces:**
- Consumes: `pool` from `src/config/db.js` (per Task 1's schema).
- Produces (consumed by Task 3's `accountController.js`):
  - `getProfile(email) => Promise<{ email, name, username, role, bio, photo_url }>`
  - `upsertProfile(email, { name, username, role, bio, photo_url }) => Promise<Profile>`
  - `getAddress(email) => Promise<{ email, line1, line2, city, state, postal_code, country, phone }>`
  - `upsertAddress(email, { line1, line2, city, state, postal_code, country, phone }) => Promise<Address>`
  - `deleteAddress(email) => Promise<void>`
  - `getPaymentMethod(email) => Promise<{ email, brand, last4, expiry_month, expiry_year, billing_name }>`
  - `upsertPaymentMethod(email, { brand, last4, expiry_month, expiry_year, billing_name }) => Promise<PaymentMethod>`
  - `deletePaymentMethod(email) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `test/accountService.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern='accountService'` — actually this repo doesn't filter by describe blocks; instead run the single file directly:
Run: `node --test test/accountService.test.js`
Expected: `Cannot find module '../src/services/accountService'` (module doesn't exist yet).

- [ ] **Step 3: Write `src/services/accountService.js`**

```js
const { pool } = require('../config/db');

// Every table here is keyed directly by the requester's own JWT email
// (req.customerEmail), so unlike orderService there's no separate id and no
// ownership check to make - the row a customer can read/write is always
// their own. issueToken lowercases before signing (see
// src/controllers/authController.js), but that's a guarantee this layer
// doesn't control, so every query normalizes here too rather than trusting
// callers to have already done it.

async function getProfile(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_profiles WHERE email = $1', [normalized]);
  return (
    rows[0] || { email: normalized, name: null, username: null, role: null, bio: null, photo_url: null }
  );
}

async function upsertProfile(email, { name, username, role, bio, photo_url }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_profiles (email, name, username, role, bio, photo_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (email) DO UPDATE SET
       name = $2, username = $3, role = $4, bio = $5, photo_url = $6, updated_at = now()
     RETURNING email, name, username, role, bio, photo_url`,
    [normalized, name, username, role, bio, photo_url]
  );
  return rows[0];
}

async function getAddress(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_addresses WHERE email = $1', [normalized]);
  return (
    rows[0] || {
      email: normalized,
      line1: null,
      line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      phone: null,
    }
  );
}

async function upsertAddress(email, { line1, line2, city, state, postal_code, country, phone }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_addresses (email, line1, line2, city, state, postal_code, country, phone, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (email) DO UPDATE SET
       line1 = $2, line2 = $3, city = $4, state = $5, postal_code = $6, country = $7, phone = $8, updated_at = now()
     RETURNING email, line1, line2, city, state, postal_code, country, phone`,
    [normalized, line1, line2, city, state, postal_code, country, phone]
  );
  return rows[0];
}

async function deleteAddress(email) {
  await pool.query('DELETE FROM customer_addresses WHERE email = $1', [email.toLowerCase()]);
}

async function getPaymentMethod(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_payment_methods WHERE email = $1', [normalized]);
  return (
    rows[0] || {
      email: normalized,
      brand: null,
      last4: null,
      expiry_month: null,
      expiry_year: null,
      billing_name: null,
    }
  );
}

async function upsertPaymentMethod(email, { brand, last4, expiry_month, expiry_year, billing_name }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_payment_methods (email, brand, last4, expiry_month, expiry_year, billing_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (email) DO UPDATE SET
       brand = $2, last4 = $3, expiry_month = $4, expiry_year = $5, billing_name = $6, updated_at = now()
     RETURNING email, brand, last4, expiry_month, expiry_year, billing_name`,
    [normalized, brand, last4, expiry_month, expiry_year, billing_name]
  );
  return rows[0];
}

async function deletePaymentMethod(email) {
  await pool.query('DELETE FROM customer_payment_methods WHERE email = $1', [email.toLowerCase()]);
}

module.exports = {
  getProfile,
  upsertProfile,
  getAddress,
  upsertAddress,
  deleteAddress,
  getPaymentMethod,
  upsertPaymentMethod,
  deletePaymentMethod,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/accountService.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/accountService.js test/accountService.test.js
git commit -m "Add accountService for profile/address/payment-method storage"
```

---

### Task 3: `accountController.js` — validation and request handling

**Files:**
- Create: `src/controllers/accountController.js`

**Interfaces:**
- Consumes: `accountService` from Task 2 (exact function names/signatures above).
- Produces (consumed by Task 4's `accountRoutes.js`): `getProfile`, `updateProfile`, `getAddress`, `updateAddress`, `deleteAddress`, `getPaymentMethod`, `updatePaymentMethod`, `deletePaymentMethod` — all `(req, res) => Promise<void>` Express handlers.

- [ ] **Step 1: Write `src/controllers/accountController.js`**

```js
const accountService = require('../services/accountService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const ROLE_OPTIONS = ['devops', 'customer service', 'HR', 'security', 'admin'];
const NAME_MAX = 100;
const USERNAME_MAX = 50;
const BIO_MAX = 500;
const PHOTO_URL_MAX = 2048;
const URL_RE = /^https?:\/\/\S+$/;

// Blank/missing -> null (a customer clearing a field). Present but the
// wrong shape -> undefined, which the caller below treats as invalid input
// rather than silently coercing it to something the customer didn't type.
function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  return value;
}

function cleanRequiredText(value, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) return undefined;
  return value;
}

function validateProfileInput(body) {
  const name = cleanOptionalText(body.name, NAME_MAX);
  const username = cleanOptionalText(body.username, USERNAME_MAX);
  const bio = cleanOptionalText(body.bio, BIO_MAX);
  const photo_url = cleanOptionalText(body.photo_url, PHOTO_URL_MAX);
  const role = body.role === undefined || body.role === null || body.role === '' ? null : body.role;

  if ([name, username, bio, photo_url].includes(undefined)) return null;
  if (role !== null && !ROLE_OPTIONS.includes(role)) return null;
  if (photo_url !== null && !URL_RE.test(photo_url)) return null;

  return { name, username, role, bio, photo_url };
}

function validateAddressInput(body) {
  const line1 = cleanRequiredText(body.line1, 200);
  const line2 = cleanOptionalText(body.line2, 200);
  const city = cleanRequiredText(body.city, 200);
  const state = cleanOptionalText(body.state, 200);
  const postal_code = cleanRequiredText(body.postal_code, 20);
  const country = cleanRequiredText(body.country, 200);
  const phone = cleanOptionalText(body.phone, 30);

  if ([line1, line2, city, state, postal_code, country, phone].includes(undefined)) return null;

  return { line1, line2, city, state, postal_code, country, phone };
}

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Discover'];
const LAST4_RE = /^\d{4}$/;

function validatePaymentInput(body) {
  const brand = body.brand;
  const last4 = body.last4;
  const expiry_month = Number(body.expiry_month);
  const expiry_year = Number(body.expiry_year);
  const billing_name = cleanRequiredText(body.billing_name, 100);
  const currentYear = new Date().getFullYear();

  if (!BRAND_OPTIONS.includes(brand)) return null;
  if (typeof last4 !== 'string' || !LAST4_RE.test(last4)) return null;
  if (!Number.isInteger(expiry_month) || expiry_month < 1 || expiry_month > 12) return null;
  if (!Number.isInteger(expiry_year) || expiry_year < currentYear || expiry_year > currentYear + 20) return null;
  if (billing_name === undefined) return null;

  return { brand, last4, expiry_month, expiry_year, billing_name };
}

async function getProfile(req, res) {
  try {
    const profile = await accountService.getProfile(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(profile);
  } catch (err) {
    logError('Profile lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your profile.' });
  }
}

async function updateProfile(req, res) {
  const input = validateProfileInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid profile data.' });
  }

  try {
    const profile = await accountService.upsertProfile(req.customerEmail, input);
    auditLog('account.profile_updated', { email: req.customerEmail });
    res.json(profile);
  } catch (err) {
    logError('Profile update error', err);
    res.status(500).json({ error: 'Something went wrong saving your profile.' });
  }
}

async function getAddress(req, res) {
  try {
    const address = await accountService.getAddress(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(address);
  } catch (err) {
    logError('Address lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your address.' });
  }
}

async function updateAddress(req, res) {
  const input = validateAddressInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid address data.' });
  }

  try {
    const address = await accountService.upsertAddress(req.customerEmail, input);
    auditLog('account.address_updated', { email: req.customerEmail });
    res.json(address);
  } catch (err) {
    logError('Address update error', err);
    res.status(500).json({ error: 'Something went wrong saving your address.' });
  }
}

async function deleteAddress(req, res) {
  try {
    await accountService.deleteAddress(req.customerEmail);
    auditLog('account.address_removed', { email: req.customerEmail });
    res.status(204).end();
  } catch (err) {
    logError('Address removal error', err);
    res.status(500).json({ error: 'Something went wrong removing your address.' });
  }
}

async function getPaymentMethod(req, res) {
  try {
    const method = await accountService.getPaymentMethod(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(method);
  } catch (err) {
    logError('Payment method lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your payment method.' });
  }
}

async function updatePaymentMethod(req, res) {
  const input = validatePaymentInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid payment method data.' });
  }

  try {
    const method = await accountService.upsertPaymentMethod(req.customerEmail, input);
    auditLog('account.payment_method_updated', { email: req.customerEmail });
    res.json(method);
  } catch (err) {
    logError('Payment method update error', err);
    res.status(500).json({ error: 'Something went wrong saving your payment method.' });
  }
}

async function deletePaymentMethod(req, res) {
  try {
    await accountService.deletePaymentMethod(req.customerEmail);
    auditLog('account.payment_method_removed', { email: req.customerEmail });
    res.status(204).end();
  } catch (err) {
    logError('Payment method removal error', err);
    res.status(500).json({ error: 'Something went wrong removing your payment method.' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  // Exported for direct unit testing of the validation rules in Task 4's
  // integration tests without needing a live request for every edge case.
  validateProfileInput,
  validateAddressInput,
  validatePaymentInput,
};
```

- [ ] **Step 2: Commit**

There's no standalone controller test file in this codebase's convention (`orderController.js` is only exercised through `test/app.test.js`'s real-HTTP tests) — Task 4 covers this controller the same way. Commit now so Task 4's diff stays focused on routing/mounting:

```bash
git add src/controllers/accountController.js
git commit -m "Add accountController with profile/address/payment-method validation"
```

---

### Task 4: Routes, rate limiting, app mounting, and integration tests

**Files:**
- Create: `src/routes/accountRoutes.js`
- Modify: `src/middleware/rateLimiter.js` (add `accountLimiter`)
- Modify: `src/app.js:9-11` (require accountRoutes/accountLimiter), `src/app.js:96` area (mount `/api/account`)
- Modify: `package.json:9` (test script env vars)
- Modify: `.env.example` (document new rate-limit vars)
- Modify: `README.md` (rate limiting section, audit log table)
- Test: `test/account.test.js`

**Interfaces:**
- Consumes: `accountController` handlers from Task 3.
- Produces: `GET/PUT /api/account/profile`, `GET/PUT/DELETE /api/account/address`, `GET/PUT/DELETE /api/account/payment-method`, all behind `requireCustomerAuth` + `accountLimiter`.

- [ ] **Step 1: Write `src/routes/accountRoutes.js`**

```js
const { Router } = require('express');
const {
  getProfile,
  updateProfile,
  getAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} = require('../controllers/accountController');

const router = Router();

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.get('/address', getAddress);
router.put('/address', updateAddress);
router.delete('/address', deleteAddress);

router.get('/payment-method', getPaymentMethod);
router.put('/payment-method', updatePaymentMethod);
router.delete('/payment-method', deletePaymentMethod);

module.exports = router;
```

- [ ] **Step 2: Add `accountLimiter` to `src/middleware/rateLimiter.js`**

Insert after the `ordersLimiter` definition (before the `authLimiter` comment), and add `accountLimiter` to the final `module.exports`:

```js
// Same per-customer keying and cadence as ordersLimiter - settings reads/
// writes are infrequent per session, but this still bounds a leaked token
// hammering profile/address/payment-method the same way orders is bounded.
const accountLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ACCOUNT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_ACCOUNT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByCustomer,
  message: { error: 'Too many account requests, please try again shortly.' },
  handler: auditedHandler('account'),
});
```

```js
module.exports = { chatLimiter, ordersLimiter, authLimiter, accountLimiter };
```

- [ ] **Step 3: Mount the router in `src/app.js`**

At line 9-11, add the require alongside the existing route requires:

```js
const orderRoutes = require('./routes/orderRoutes');
const accountRoutes = require('./routes/accountRoutes');
```

At line 11, update the rate-limiter require:

```js
const { chatLimiter, ordersLimiter, authLimiter, accountLimiter } = require('./middleware/rateLimiter');
```

Immediately after the existing `app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);` line, add:

```js
app.use('/api/account', requireCustomerAuth, accountLimiter, accountRoutes);
```

- [ ] **Step 4: Write the failing integration tests**

Create `test/account.test.js`, mirroring `test/app.test.js`'s `withServer` helper:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { issueToken } = require('../src/services/authService');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function authHeaders(email) {
  return { Authorization: `Bearer ${issueToken(email)}`, 'Content-Type': 'application/json' };
}

test('GET /api/account/profile requires auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/profile`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/account/profile returns all-null defaults when nothing saved yet', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/profile`, { headers: authHeaders('jane.doe@example.com') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, null);
    assert.equal(body.role, null);
  });
});

test('PUT /api/account/profile saves valid data', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => ({
    rows: [{ email: 'jane.doe@example.com', name: params[1], username: params[2], role: params[3], bio: params[4], photo_url: params[5] }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/profile`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ name: 'Jane Doe', username: 'janedoe', role: 'admin', bio: 'Hi', photo_url: 'https://example.com/p.jpg' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.username, 'janedoe');
  });
});

test('PUT /api/account/profile rejects an unknown role', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/profile`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ role: 'ceo' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/account/profile rejects a non-http photo_url', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/profile`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ photo_url: 'javascript:alert(1)' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/account/address saves valid data', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => ({
    rows: [{ email: 'jane.doe@example.com', line1: params[1], line2: params[2], city: params[3], state: params[4], postal_code: params[5], country: params[6], phone: params[7] }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/address`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ line1: '1 Main St', line2: null, city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US', phone: null }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.city, 'Springfield');
  });
});

test('PUT /api/account/address rejects a missing required field', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/address`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ line1: '1 Main St', city: '', postal_code: '62701', country: 'US' }),
    });
    assert.equal(res.status, 400);
  });
});

test('DELETE /api/account/address clears the saved address', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/address`, { method: 'DELETE', headers: authHeaders('jane.doe@example.com') });
    assert.equal(res.status, 204);
  });
  assert.equal(query.mock.callCount(), 1);
});

test('PUT /api/account/payment-method saves valid data, never echoing more than last4', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => ({
    rows: [{ email: 'jane.doe@example.com', brand: params[1], last4: params[2], expiry_month: params[3], expiry_year: params[4], billing_name: params[5] }],
  }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/payment-method`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ brand: 'Visa', last4: '4242', expiry_month: 8, expiry_year: new Date().getFullYear() + 1, billing_name: 'Jane Doe' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['billing_name', 'brand', 'email', 'expiry_month', 'expiry_year', 'last4']);
  });
});

test('PUT /api/account/payment-method rejects a last4 that is not 4 digits', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/payment-method`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ brand: 'Visa', last4: '42425', expiry_month: 8, expiry_year: new Date().getFullYear() + 1, billing_name: 'Jane Doe' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/account/payment-method rejects an expired year', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/payment-method`, {
      method: 'PUT',
      headers: authHeaders('jane.doe@example.com'),
      body: JSON.stringify({ brand: 'Visa', last4: '4242', expiry_month: 8, expiry_year: 2000, billing_name: 'Jane Doe' }),
    });
    assert.equal(res.status, 400);
  });
});

test('DELETE /api/account/payment-method clears the saved method', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/account/payment-method`, { method: 'DELETE', headers: authHeaders('jane.doe@example.com') });
    assert.equal(res.status, 204);
  });
  assert.equal(query.mock.callCount(), 1);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `node --test test/account.test.js`
Expected: connection/404 failures — `accountRoutes.js` doesn't exist yet and `/api/account/*` isn't mounted.

- [ ] **Step 6: Verify Steps 1-3 above are in place, then run tests again**

Run: `node --test test/account.test.js`
Expected: all tests pass.

- [ ] **Step 7: Run the full backend suite to check nothing else broke**

Run: `npm test`
Expected: all tests pass, including the pre-existing suite.

- [ ] **Step 8: Update `package.json`'s test script env vars**

In `package.json:9`, add the two new rate-limit env vars alongside the existing `RATE_LIMIT_ORDERS_*` pair (same CI-predictability reasoning as those):

```
"test": "ANTHROPIC_API_KEY=test-key-for-ci DATABASE_URL=postgresql://test:test@localhost:5432/test JWT_SECRET=test-secret-for-ci RATE_LIMIT_MAX=20 RATE_LIMIT_WINDOW_MS=60000 RATE_LIMIT_ORDERS_MAX=20 RATE_LIMIT_ORDERS_WINDOW_MS=60000 RATE_LIMIT_ACCOUNT_MAX=20 RATE_LIMIT_ACCOUNT_WINDOW_MS=60000 RATE_LIMIT_AUTH_MAX=20 RATE_LIMIT_AUTH_WINDOW_MS=60000 LOG_LEVEL=silent node --test",
```

- [ ] **Step 9: Document the new env vars in `.env.example`**

After the `RATE_LIMIT_ORDERS_*` block, add:

```
# Optional - defaults to 30 requests per 60s per client if unset
RATE_LIMIT_ACCOUNT_MAX=
RATE_LIMIT_ACCOUNT_WINDOW_MS=
```

- [ ] **Step 10: Update `README.md`'s rate limiting section**

At `README.md:144` (after the `/api/orders/:id` bullet), add:

```
- `/api/account/*` (profile/address/payment-method) is capped at `RATE_LIMIT_ACCOUNT_MAX` requests (default 30) per `RATE_LIMIT_ACCOUNT_WINDOW_MS` (default 60s) per client.
```

At `README.md:184` (the audit log table), add four rows after `rate_limit.exceeded`:

```
| `account.profile_updated` | `accountController.js` | A customer saved profile changes |
| `account.address_updated` | `accountController.js` | A customer saved address changes |
| `account.address_removed` | `accountController.js` | A customer cleared their saved address |
| `account.payment_method_updated` | `accountController.js` | A customer saved payment method changes |
| `account.payment_method_removed` | `accountController.js` | A customer cleared their saved payment method |
```

And update the `rate_limit.exceeded` row's `limiter` enum to include the new value: `` `limiter`: `chat`/`orders`/`account`/`auth` ``.

- [ ] **Step 11: Run the full suite one more time and commit**

Run: `npm test`
Expected: all tests pass.

```bash
git add src/routes/accountRoutes.js src/middleware/rateLimiter.js src/app.js package.json .env.example README.md test/account.test.js
git commit -m "Wire up /api/account routes with rate limiting and integration tests"
```

---

### Task 5: `openapi.json` — document the new endpoints

**Files:**
- Modify: `openapi.json` (add an `Account` tag, three `Profile`/`Address`/`PaymentMethod` schemas, and the `/api/account/profile`, `/api/account/address`, `/api/account/payment-method` paths)

**Interfaces:**
- Consumes: no code interface — this is a documentation-only change validated by `test/apiDocs.test.js`'s schema validator.

- [ ] **Step 1: Add the `Account` tag**

In the top-level `"tags"` array, after the `"Orders"` tag entry, add:

```json
{ "name": "Account", "description": "A customer's own profile, address, and saved payment method - requires a bearer token" }
```

- [ ] **Step 2: Add the three schemas**

In `"components"."schemas"`, after the `"Order"` schema, add:

```json
"Profile": {
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" },
    "name": { "type": ["string", "null"], "maxLength": 100 },
    "username": { "type": ["string", "null"], "maxLength": 50 },
    "role": { "type": ["string", "null"], "enum": ["devops", "customer service", "HR", "security", "admin", null] },
    "bio": { "type": ["string", "null"], "maxLength": 500 },
    "photo_url": { "type": ["string", "null"], "format": "uri", "maxLength": 2048 }
  }
},
"Address": {
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" },
    "line1": { "type": ["string", "null"], "maxLength": 200 },
    "line2": { "type": ["string", "null"], "maxLength": 200 },
    "city": { "type": ["string", "null"], "maxLength": 200 },
    "state": { "type": ["string", "null"], "maxLength": 200 },
    "postal_code": { "type": ["string", "null"], "maxLength": 20 },
    "country": { "type": ["string", "null"], "maxLength": 200 },
    "phone": { "type": ["string", "null"], "maxLength": 30 }
  }
},
"PaymentMethod": {
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" },
    "brand": { "type": ["string", "null"], "enum": ["Visa", "Mastercard", "Amex", "Discover", null] },
    "last4": { "type": ["string", "null"], "pattern": "^[0-9]{4}$" },
    "expiry_month": { "type": ["integer", "null"], "minimum": 1, "maximum": 12 },
    "expiry_year": { "type": ["integer", "null"] },
    "billing_name": { "type": ["string", "null"], "maxLength": 100 }
  },
  "description": "Display-only card data. This app never stores a full card number or CVV - see README > Security for why."
}
```

- [ ] **Step 3: Add the three paths**

In `"paths"`, after the `/api/orders/{id}` entry, add:

```json
"/api/account/profile": {
  "get": {
    "tags": ["Account"],
    "summary": "Get the current customer's profile",
    "security": [{ "bearerAuth": [] }],
    "responses": {
      "200": { "description": "Profile (all fields null if nothing saved yet)", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Profile" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  },
  "put": {
    "tags": ["Account"],
    "summary": "Save the current customer's profile",
    "security": [{ "bearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Profile" } } }
    },
    "responses": {
      "200": { "description": "Saved profile", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Profile" } } } },
      "400": { "description": "Invalid profile data", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  }
},
"/api/account/address": {
  "get": {
    "tags": ["Account"],
    "summary": "Get the current customer's saved address",
    "security": [{ "bearerAuth": [] }],
    "responses": {
      "200": { "description": "Address (all fields null if nothing saved yet)", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Address" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  },
  "put": {
    "tags": ["Account"],
    "summary": "Save the current customer's address",
    "security": [{ "bearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Address" } } }
    },
    "responses": {
      "200": { "description": "Saved address", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Address" } } } },
      "400": { "description": "Invalid address data", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  },
  "delete": {
    "tags": ["Account"],
    "summary": "Remove the current customer's saved address",
    "security": [{ "bearerAuth": [] }],
    "responses": {
      "204": { "description": "Address removed" },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  }
},
"/api/account/payment-method": {
  "get": {
    "tags": ["Account"],
    "summary": "Get the current customer's saved payment method",
    "security": [{ "bearerAuth": [] }],
    "responses": {
      "200": { "description": "Payment method (all fields null if nothing saved yet)", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PaymentMethod" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  },
  "put": {
    "tags": ["Account"],
    "summary": "Save the current customer's payment method",
    "security": [{ "bearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PaymentMethod" } } }
    },
    "responses": {
      "200": { "description": "Saved payment method", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/PaymentMethod" } } } },
      "400": { "description": "Invalid payment method data", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Error" } } } },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  },
  "delete": {
    "tags": ["Account"],
    "summary": "Remove the current customer's saved payment method",
    "security": [{ "bearerAuth": [] }],
    "responses": {
      "204": { "description": "Payment method removed" },
      "401": { "$ref": "#/components/responses/Unauthorized" },
      "429": { "$ref": "#/components/responses/TooManyRequests" }
    }
  }
}
```

- [ ] **Step 4: Validate and run the docs test**

Run: `node --test test/apiDocs.test.js`
Expected: passes (this test runs the spec through `@apidevtools/swagger-parser`, so a JSON or schema-reference mistake fails loudly here rather than silently shipping a broken `/api-docs` page).

- [ ] **Step 5: Commit**

```bash
git add openapi.json
git commit -m "Document /api/account/* endpoints in openapi.json"
```

---

### Task 6: Frontend — real Profile page

**Files:**
- Create: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/App.jsx:7,20-22,34-89` (import icon, lazy-import page, add `/profile` route)
- Modify: `frontend/src/components/ProfileMenu.jsx:5,82-87` (add a "Profile" link above "Address")

**Interfaces:**
- Consumes: `useAuthorizedFetch()` from `frontend/src/hooks/useAuthorizedFetch.js`; `GET/PUT /api/account/profile` from Task 4.
- Produces: `<Route path="/profile">`, consumed by the `ProfileMenu` link added in this task.

- [ ] **Step 1: Write `frontend/src/pages/ProfilePage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const ROLE_OPTIONS = ['devops', 'customer service', 'HR', 'security', 'admin'];

export function ProfilePage() {
  const authorizedFetch = useAuthorizedFetch();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/profile');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your profile.');
          return;
        }
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  function updateField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name || null,
          username: profile.username || null,
          role: profile.role || null,
          bio: profile.bio || null,
          photo_url: profile.photo_url || null,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your profile.');
        return;
      }
      const data = await res.json();
      setProfile(data);
      setSavedAt(new Date());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !error) return <p className="subtitle">Loading...</p>;

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <>
          <label className="settings-field">
            <span>Name</span>
            <input type="text" value={profile.name || ''} onChange={(e) => updateField('name', e.target.value)} maxLength={100} />
          </label>

          <label className="settings-field">
            <span>Username</span>
            <input type="text" value={profile.username || ''} onChange={(e) => updateField('username', e.target.value)} maxLength={50} />
          </label>

          <label className="settings-field">
            <span>Role</span>
            <select value={profile.role || ''} onChange={(e) => updateField('role', e.target.value)}>
              <option value="">Not set</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Bio</span>
            <textarea value={profile.bio || ''} onChange={(e) => updateField('bio', e.target.value)} maxLength={500} rows={4} />
          </label>

          <label className="settings-field">
            <span>Photo URL</span>
            <input
              type="url"
              value={profile.photo_url || ''}
              onChange={(e) => updateField('photo_url', e.target.value)}
              placeholder="https://..."
              maxLength={2048}
            />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {savedAt && <span className="settings-saved-note">Saved</span>}
          </div>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Add the `/profile` route in `frontend/src/App.jsx`**

At line 7, add `PersonIcon` to the existing icons import:

```js
import { CardIcon, HeartIcon, PersonIcon, PinIcon, ShopIcon, TicketIcon } from './components/icons.jsx';
```

After line 18 (`const ChatPage = ...`), add:

```js
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then((m) => ({ default: m.ProfilePage })));
```

After the `<Route path="/chat" element={<ChatPage />} />` line, add:

```jsx
<Route path="/profile" element={<ProfilePage />} />
```

- [ ] **Step 3: Add a "Profile" link in `frontend/src/components/ProfileMenu.jsx`**

At line 5, add `PersonIcon` to the icons import:

```js
import { CardIcon, ChevronDownIcon, LogoutIcon, MonitorIcon, MoonIcon, PersonIcon, PinIcon, QuestionIcon, SunIcon } from './icons.jsx';
```

Immediately before the existing `<Link to="/address" ...>` line, add:

```jsx
<Link to="/profile" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
  <PersonIcon width="16" height="16" /> Profile
</Link>
```

Update the file's header comment (lines 13-25) to drop the now-inaccurate "no fabricated name field" claim, since profile data is real as of this task:

Replace:

```
// data model behind either yet, see App.jsx), and real Sign Out - not the
```

With:

```
// data model behind either yet, see App.jsx - Address/Payment Methods get
// their own real pages in a later task), and real Sign Out - not the
```

- [ ] **Step 4: Build and smoke-test in a browser**

Run: `npm --prefix frontend run build`
Expected: builds with no errors.

Run the app (`npm run dev` or `npm start` after a build) and manually verify: open the account menu, click "Profile", fill in the form, click "Save changes", reload the page, confirm the saved values persist.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProfilePage.jsx frontend/src/App.jsx frontend/src/components/ProfileMenu.jsx
git commit -m "Add real Profile settings page"
```

---

### Task 7: Frontend — real Address page

**Files:**
- Create: `frontend/src/pages/AddressPage.jsx`
- Modify: `frontend/src/App.jsx` (swap the `/address` route's `ComingSoonPage` for `AddressPage`)

**Interfaces:**
- Consumes: `useAuthorizedFetch()`; `GET/PUT/DELETE /api/account/address` from Task 4.

- [ ] **Step 1: Write `frontend/src/pages/AddressPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', state: '', postal_code: '', country: '', phone: '' };

export function AddressPage() {
  const authorizedFetch = useAuthorizedFetch();
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/address');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your address.');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAddress({
            line1: data.line1 || '',
            line2: data.line2 || '',
            city: data.city || '',
            state: data.state || '',
            postal_code: data.postal_code || '',
            country: data.country || '',
            phone: data.phone || '',
          });
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  function updateField(field, value) {
    setAddress((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/address', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city,
          state: address.state || null,
          postal_code: address.postal_code,
          country: address.country,
          phone: address.phone || null,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your address.');
        return;
      }
      setSavedAt(new Date());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/address', { method: 'DELETE' });
      if (res.status === 401) return;
      if (!res.ok && res.status !== 204) {
        setError('Something went wrong removing your address.');
        return;
      }
      setAddress(EMPTY_ADDRESS);
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!address && !error) return <p className="subtitle">Loading...</p>;

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {address && (
        <>
          <label className="settings-field">
            <span>Address line 1</span>
            <input type="text" required value={address.line1} onChange={(e) => updateField('line1', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Address line 2</span>
            <input type="text" value={address.line2} onChange={(e) => updateField('line2', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>City</span>
            <input type="text" required value={address.city} onChange={(e) => updateField('city', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>State / Province</span>
            <input type="text" value={address.state} onChange={(e) => updateField('state', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Postal code</span>
            <input type="text" required value={address.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} maxLength={20} />
          </label>

          <label className="settings-field">
            <span>Country</span>
            <input type="text" required value={address.country} onChange={(e) => updateField('country', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Phone</span>
            <input type="tel" value={address.phone} onChange={(e) => updateField('phone', e.target.value)} maxLength={30} />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save address'}
            </button>
            <button type="button" className="settings-remove-btn" onClick={handleRemove} disabled={saving}>
              Remove
            </button>
            {savedAt && <span className="settings-saved-note">Saved</span>}
          </div>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Swap the `/address` route in `frontend/src/App.jsx`**

After the `ProfilePage` lazy import added in Task 6, add:

```js
const AddressPage = lazy(() => import('./pages/AddressPage.jsx').then((m) => ({ default: m.AddressPage })));
```

Replace the existing `/address` route:

```jsx
<Route
  path="/address"
  element={
    <ComingSoonPage
      icon={PinIcon}
      title="Address"
      text="Saved shipping addresses will show up here once this is built."
    />
  }
/>
```

With:

```jsx
<Route path="/address" element={<AddressPage />} />
```

`PinIcon` is no longer used by this route, but stays imported for `ProfileMenu.jsx`'s "Address" link icon - leave the `App.jsx` import list as-is except for removing `PinIcon` specifically if (and only if) nothing else in `App.jsx` still references it. Check with:

Run: `grep -n "PinIcon" frontend/src/App.jsx`
Expected: no remaining references (only the `/payment` route still uses `CardIcon`, not `PinIcon`) - if so, remove `PinIcon` from the `App.jsx` import line added in Task 6.

- [ ] **Step 3: Build and smoke-test**

Run: `npm --prefix frontend run build`
Expected: no errors, no unused-import warnings.

Manually verify in a browser: open Address from the account menu, fill in required fields, save, reload, confirm persistence; click Remove, confirm the form clears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AddressPage.jsx frontend/src/App.jsx
git commit -m "Add real Address settings page"
```

---

### Task 8: Frontend — real Payment Method page

**Files:**
- Create: `frontend/src/pages/PaymentPage.jsx`
- Modify: `frontend/src/App.jsx` (swap the `/payment` route's `ComingSoonPage` for `PaymentPage`)

**Interfaces:**
- Consumes: `useAuthorizedFetch()`; `GET/PUT/DELETE /api/account/payment-method` from Task 4.

- [ ] **Step 1: Write `frontend/src/pages/PaymentPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Discover'];
const EMPTY_METHOD = { brand: '', last4: '', expiry_month: '', expiry_year: '', billing_name: '' };

export function PaymentPage() {
  const authorizedFetch = useAuthorizedFetch();
  const [method, setMethod] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/payment-method');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your payment method.');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setMethod({
            brand: data.brand || '',
            last4: data.last4 || '',
            expiry_month: data.expiry_month ?? '',
            expiry_year: data.expiry_year ?? '',
            billing_name: data.billing_name || '',
          });
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  function updateField(field, value) {
    setMethod((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/payment-method', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: method.brand,
          last4: method.last4,
          expiry_month: Number(method.expiry_month),
          expiry_year: Number(method.expiry_year),
          billing_name: method.billing_name,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your payment method.');
        return;
      }
      setSavedAt(new Date());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/payment-method', { method: 'DELETE' });
      if (res.status === 401) return;
      if (!res.ok && res.status !== 204) {
        setError('Something went wrong removing your payment method.');
        return;
      }
      setMethod(EMPTY_METHOD);
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!method && !error) return <p className="subtitle">Loading...</p>;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear + i);

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="settings-note">
        Only the card brand, last 4 digits, expiry, and billing name are stored - never a full card number or
        security code.
      </p>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {method && (
        <>
          <label className="settings-field">
            <span>Card brand</span>
            <select required value={method.brand} onChange={(e) => updateField('brand', e.target.value)}>
              <option value="">Select a brand</option>
              {BRAND_OPTIONS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Last 4 digits</span>
            <input
              type="text"
              inputMode="numeric"
              required
              pattern="[0-9]{4}"
              maxLength={4}
              value={method.last4}
              onChange={(e) => updateField('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>

          <label className="settings-field">
            <span>Expiry month</span>
            <select required value={method.expiry_month} onChange={(e) => updateField('expiry_month', e.target.value)}>
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Expiry year</span>
            <select required value={method.expiry_year} onChange={(e) => updateField('expiry_year', e.target.value)}>
              <option value="">Year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Billing name</span>
            <input type="text" required value={method.billing_name} onChange={(e) => updateField('billing_name', e.target.value)} maxLength={100} />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save payment method'}
            </button>
            <button type="button" className="settings-remove-btn" onClick={handleRemove} disabled={saving}>
              Remove
            </button>
            {savedAt && <span className="settings-saved-note">Saved</span>}
          </div>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Swap the `/payment` route in `frontend/src/App.jsx`**

After the `AddressPage` lazy import added in Task 7, add:

```js
const PaymentPage = lazy(() => import('./pages/PaymentPage.jsx').then((m) => ({ default: m.PaymentPage })));
```

Replace the existing `/payment` route:

```jsx
<Route
  path="/payment"
  element={
    <ComingSoonPage
      icon={CardIcon}
      title="Payment Methods"
      text="Saved payment methods will show up here once this is built."
    />
  }
/>
```

With:

```jsx
<Route path="/payment" element={<PaymentPage />} />
```

`CardIcon` stays imported (still used by `ProfileMenu.jsx`'s "Payment Methods" link).

- [ ] **Step 3: Remove `ComingSoonPage` import if now unused**

Run: `grep -n "ComingSoonPage" frontend/src/App.jsx`
Expected: `ComingSoonPage` is still used by the `/coupons`, `/wishlist`, and `/shop` routes - the import and lazy declaration stay as-is. Confirm this rather than assuming, since removing a still-used import would break the build.

- [ ] **Step 4: Build and smoke-test**

Run: `npm --prefix frontend run build`
Expected: no errors.

Manually verify in a browser: open Payment Methods from the account menu, fill in and save a method, reload, confirm persistence; click Remove, confirm the form clears.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PaymentPage.jsx frontend/src/App.jsx
git commit -m "Add real Payment Method settings page"
```

---

### Task 9: Settings form styles

**Files:**
- Modify: `frontend/src/index.css` (append a new "Account settings forms" section)

**Interfaces:**
- Consumes: existing CSS custom properties (`--color-bg`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-panel-bg`, `--color-primary`, `--color-primary-text`, `--color-cta`, `--color-cta-hover`, `--color-error-surface`, `--color-error-text`, `--color-focus-ring`) already defined for both light and dark themes at the top of this file - no new tokens needed.
- Produces: `.settings-form`, `.settings-field`, `.settings-note`, `.settings-actions`, `.settings-save-btn`, `.settings-remove-btn`, `.settings-saved-note` classes, consumed by Tasks 6-8's pages.

- [ ] **Step 1: Append the new styles**

Add to the end of `frontend/src/index.css`:

```css
/* Account settings forms (Profile/Address/Payment Method) */

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 480px;
}

.settings-note {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text);
}

.settings-field input,
.settings-field select,
.settings-field textarea {
  font: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-panel-bg);
  color: var(--color-text);
}

.settings-field textarea {
  resize: vertical;
}

.settings-field input:focus-visible,
.settings-field select:focus-visible,
.settings-field textarea:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.settings-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.settings-save-btn {
  font: inherit;
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-primary-text);
  cursor: pointer;
}

.settings-save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.settings-save-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.settings-remove-btn {
  font: inherit;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.settings-remove-btn:hover:not(:disabled) {
  background: var(--color-panel-bg);
}

.settings-remove-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.settings-saved-note {
  font-size: 13px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 2: Visual QA**

Run the dev server, visit `/profile`, `/address`, and `/payment` in both light and dark mode (the profile-menu theme toggle). Confirm: inputs are legible against their background in both themes, focus rings are visible when tabbing through fields, the Save/Remove buttons have adequate contrast.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "Style the account settings forms"
```

---

### Task 10: End-to-end tests

**Files:**
- Create: `e2e/account.spec.js`

**Interfaces:**
- Consumes: `verifyAs` helper from `e2e/helpers.js`; the real `/profile`, `/address`, `/payment` pages from Tasks 6-8.

- [ ] **Step 1: Write `e2e/account.spec.js`**

```js
const { test, expect } = require('@playwright/test');
const { verifyAs } = require('./helpers.js');

test.describe('Account settings', () => {
  test('profile changes persist across a reload', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
    await page.goto('/profile');

    await page.fill('.settings-field input[maxlength="100"]', 'Dev Account');
    await page.fill('.settings-field input[maxlength="50"]', 'devaccount');
    await page.selectOption('.settings-field select', 'devops');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field input[maxlength="100"]')).toHaveValue('Dev Account');
    await expect(page.locator('.settings-field select')).toHaveValue('devops');
  });

  test('address save and remove round-trip', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
    await page.goto('/address');

    await page.fill('.settings-field:has-text("Address line 1") input', '1 Main St');
    await page.fill('.settings-field:has-text("City") input', 'Springfield');
    await page.fill('.settings-field:has-text("Postal code") input', '62701');
    await page.fill('.settings-field:has-text("Country") input', 'US');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field:has-text("City") input')).toHaveValue('Springfield');

    await page.click('.settings-remove-btn');
    await page.reload();
    await expect(page.locator('.settings-field:has-text("City") input')).toHaveValue('');
  });

  test('payment method save and remove round-trip', async ({ page }) => {
    await verifyAs(page, { email: 'dev@example.com' });
    await page.goto('/payment');

    await page.selectOption('.settings-field:has-text("Card brand") select', 'Visa');
    await page.fill('.settings-field:has-text("Last 4 digits") input', '4242');
    const nextYear = String(new Date().getFullYear() + 1);
    await page.selectOption('.settings-field:has-text("Expiry month") select', '8');
    await page.selectOption('.settings-field:has-text("Expiry year") select', nextYear);
    await page.fill('.settings-field:has-text("Billing name") input', 'Dev Account');
    await page.click('.settings-save-btn');
    await expect(page.locator('.settings-saved-note')).toBeVisible();

    await page.reload();
    await expect(page.locator('.settings-field:has-text("Last 4 digits") input')).toHaveValue('4242');

    await page.click('.settings-remove-btn');
    await page.reload();
    await expect(page.locator('.settings-field:has-text("Last 4 digits") input')).toHaveValue('');
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e -- e2e/account.spec.js`
Expected: all three tests pass. (Requires a running local Postgres and the app built/served per this repo's existing e2e setup - same prerequisites `e2e/orders.spec.js` already has.)

- [ ] **Step 3: Run the full e2e suite to check nothing else broke**

Run: `npm run test:e2e`
Expected: all tests pass, including `e2e/auth.spec.js` (the "Profile" link addition to `ProfileMenu.jsx` shouldn't change any existing selector) and `e2e/accessibility.spec.js` (new form pages should still pass automated a11y checks - if it fails, check for a missing `<label>` association or contrast issue in Task 9's CSS before proceeding).

- [ ] **Step 4: Commit**

```bash
git add e2e/account.spec.js
git commit -m "Add e2e coverage for profile/address/payment settings"
```

---
