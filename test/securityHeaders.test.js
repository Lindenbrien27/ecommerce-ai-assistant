const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('sets a Content-Security-Policy tightened for this app (no unsafe-inline, not embeddable)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp, 'expected a Content-Security-Policy header');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  });
});

test('sets the standard defense-in-depth headers', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  });
});

test('does not set HSTS outside production - the header is a no-op over plain HTTP anyway', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.headers.get('strict-transport-security'), null);
  });
});
