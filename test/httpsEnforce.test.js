const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceHttps } = require('../src/middleware/httpsEnforce');

function mockRes() {
  return {
    headers: {},
    statusCode: null,
    redirectedTo: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    redirect(status, url) {
      this.statusCode = status;
      this.redirectedTo = url;
    },
  };
}

test('redirects to https when the request is not secure', () => {
  const req = { secure: false, headers: { host: 'example.com' }, originalUrl: '/api/orders/ORD-1001' };
  const res = mockRes();
  let nextCalled = false;

  enforceHttps(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 301);
  assert.equal(res.redirectedTo, 'https://example.com/api/orders/ORD-1001');
  assert.equal(nextCalled, false);
});

test('sets HSTS and continues when the request is already secure', () => {
  const req = { secure: true, headers: { host: 'example.com' }, originalUrl: '/health' };
  const res = mockRes();
  let nextCalled = false;

  enforceHttps(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.redirectedTo, null);
  assert.match(res.headers['Strict-Transport-Security'], /max-age=15552000/);
});
