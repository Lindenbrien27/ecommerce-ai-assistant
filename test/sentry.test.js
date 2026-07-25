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
  assert.equal(initMock.mock.calls[0].arguments[0].tracesSampleRate, 0);
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
