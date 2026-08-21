

process.env.NODE_ENV = 'production';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('production app redirects a plain-http request to https', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`, { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.match(res.headers.get('location'), /^https:\/\//);
  });
});

test('production app trusts X-Forwarded-Proto from Render\'s proxy and sets HSTS', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
  });
});

test('production app includes upgrade-insecure-requests in the CSP', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.match(res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  });
});
