const test = require('node:test');
const assert = require('node:assert/strict');
const Sentry = require('@sentry/node');

function requireFreshSentryConfig() {
  delete require.cache[require.resolve('../src/config/sentry')];
  return require('../src/config/sentry');
}

test('does not initialize Sentry when SENTRY_DSN is unset', (t) => {
  delete process.env.SENTRY_DSN;
  const initMock = t.mock.method(Sentry, 'init', () => {});

  requireFreshSentryConfig();

  assert.equal(initMock.mock.callCount(), 0);
});

test('initializes Sentry with the configured DSN when SENTRY_DSN is set', (t) => {
  process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';
  t.after(() => {
    delete process.env.SENTRY_DSN;
  });
  const initMock = t.mock.method(Sentry, 'init', () => {});

  requireFreshSentryConfig();

  assert.equal(initMock.mock.callCount(), 1);
  assert.equal(initMock.mock.calls[0].arguments[0].dsn, 'https://example@o0.ingest.sentry.io/0');
  assert.equal(initMock.mock.calls[0].arguments[0].tracesSampleRate, 1);
});

test('integrations excludes Sentry\'s own crash-handler defaults - crashHandlers.js already owns that job', (t) => {
  process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';
  t.after(() => {
    delete process.env.SENTRY_DSN;
  });
  const initMock = t.mock.method(Sentry, 'init', () => {});

  requireFreshSentryConfig();

  const { integrations } = initMock.mock.calls[0].arguments[0];
  assert.equal(typeof integrations, 'function');

  // Sentry.init() calls this with its own default integrations - a fake
  // defaults array covers the two that matter without needing the real SDK
  // to compute its full default set.
  const fakeDefaults = [{ name: 'OnUncaughtException' }, { name: 'OnUnhandledRejection' }, { name: 'Http' }];
  const resolved = integrations(fakeDefaults);
  const names = resolved.map((i) => i.name);

  assert.ok(!names.includes('OnUncaughtException'), 'crashHandlers.js already handles this - would double-report');
  assert.ok(!names.includes('OnUnhandledRejection'), 'crashHandlers.js already handles this - would double-report');
  assert.ok(names.includes('Http'), 'other defaults should pass through untouched');
});

test('beforeSend strips sensitive headers - this pipeline is separate from pino\'s own redact config', (t) => {
  process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';
  t.after(() => {
    delete process.env.SENTRY_DSN;
  });
  const initMock = t.mock.method(Sentry, 'init', () => {});

  requireFreshSentryConfig();

  const { beforeSend } = initMock.mock.calls[0].arguments[0];
  const event = {
    request: {
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'session=abc',
        'x-api-key': 'shared-key',
        'user-agent': 'test-agent',
      },
    },
  };

  assert.deepEqual(beforeSend(event).request.headers, { 'user-agent': 'test-agent' });
});
