const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

// Isolated in its own file so node:test's per-file process isolation gives
// this a fresh chatLimiter counter, unaffected by /api/chat calls in
// app.test.js.
test('returns 429 once a client exceeds RATE_LIMIT_MAX requests to /api/chat', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const max = Number(process.env.RATE_LIMIT_MAX);
  assert.ok(max > 0, 'RATE_LIMIT_MAX must be set for this test');

  const headers = { 'Content-Type': 'application/json', 'X-API-Key': process.env.API_KEY };
  const body = JSON.stringify({ messages: [] });

  for (let i = 0; i < max; i += 1) {
    const res = await fetch(`${base}/api/chat`, { method: 'POST', headers, body });
    assert.notEqual(res.status, 429, `request ${i + 1} should not be rate limited yet`);
  }

  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers, body });
  assert.equal(res.status, 429);
});
