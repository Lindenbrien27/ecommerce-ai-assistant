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
