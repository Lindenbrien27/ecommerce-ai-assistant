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
