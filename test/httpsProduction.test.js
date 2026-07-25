// Isolated in its own file so node:test's per-file process isolation lets
// this set NODE_ENV=production before requiring src/app - which reads that
// env var once, at module load, to decide whether to mount trust proxy and
// enforceHttps at all. Every other test file runs without NODE_ENV set, so
// this can't leak into them.
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
