const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const openApiSpec = require('../openapi.json');

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

test('GET /openapi.json serves the spec as JSON (no auth required)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/openapi.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.equal(body.openapi, '3.1.0');
    assert.deepEqual(Object.keys(body.paths).sort(), Object.keys(openApiSpec.paths).sort());
  });
});

test('GET /api-docs serves the interactive docs page (no auth required)', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api-docs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /swagger-ui-bundle\.js/);
    assert.match(html, /swagger-ui\.css/);
  });
});

test('GET /api-docs assets (swagger-ui-bundle.js, swagger-ui.css, swagger-ui-init.js) are served', async (t) => {
  await withServer(t, async (base) => {
    const bundle = await fetch(`${base}/api-docs/swagger-ui-bundle.js`);
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get('content-type'), /javascript/);

    const css = await fetch(`${base}/api-docs/swagger-ui.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const init = await fetch(`${base}/api-docs/swagger-ui-init.js`);
    assert.equal(init.status, 200);
    assert.match(init.headers.get('content-type'), /javascript/);
  });
});

test('GET /api-docs relaxes style-src to unsafe-inline (swagger-ui-bundle.js applies inline styles at runtime), scoped to that route only', async (t) => {
  await withServer(t, async (base) => {
    const docsRes = await fetch(`${base}/api-docs`);
    assert.match(docsRes.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);

    // Every other route keeps the strict policy - confirms the override in
    // src/middleware/securityHeaders.js (apiDocsStyleOverride) is actually
    // scoped to /api-docs and doesn't leak into the rest of the app.
    const healthRes = await fetch(`${base}/health`);
    const healthCsp = healthRes.headers.get('content-security-policy');
    assert.match(healthCsp, /style-src 'self'/);
    assert.doesNotMatch(healthCsp, /unsafe-inline/);
  });
});
