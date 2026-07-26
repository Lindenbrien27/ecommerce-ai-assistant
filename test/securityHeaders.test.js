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

test('CSP allows connect-src to Sentry only - the one deliberate cross-origin exception, for the optional frontend monitoring reaching its ingestion API', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    const csp = res.headers.get('content-security-policy');

    assert.match(csp, /connect-src 'self' https:\/\/\*\.sentry\.io/);
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

test('sets Cross-Origin-Embedder-Policy and Permissions-Policy - flagged by the ZAP baseline scan, not on by default', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);

    assert.equal(res.headers.get('cross-origin-embedder-policy'), 'require-corp');
    const permissionsPolicy = res.headers.get('permissions-policy');
    assert.ok(permissionsPolicy, 'expected a Permissions-Policy header');
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()']) {
      assert.ok(permissionsPolicy.includes(feature), `expected Permissions-Policy to include ${feature}`);
    }
  });
});

test('does not set HSTS outside production - the header is a no-op over plain HTTP anyway', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.headers.get('strict-transport-security'), null);
  });
});

test('does not include upgrade-insecure-requests in the CSP outside production', async (t) => {
  // Found while debugging why the cross-browser e2e suite failed on every
  // single WebKit/Mobile Safari test: this directive tells the browser to
  // silently rewrite every subresource fetch to https:, and unlike
  // Chromium/Firefox (which special-case loopback addresses), WebKit
  // applies it to 127.0.0.1/localhost too - with no real TLS listener on
  // the test/dev port, every asset request then fails and the app never
  // renders. Only meaningful once the app is actually served over HTTPS,
  // same reasoning as HSTS above.
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.doesNotMatch(res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  });
});
