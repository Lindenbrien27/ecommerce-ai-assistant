const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, logger } = require('../src/config/logger');
const { logError } = require('../src/utils/logger');

function captureStream() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(chunk.toString());
      return true;
    },
  };
}

test('the error serializer strips everything except type, message, and stack', () => {
  const stream = captureStream();

  // The test script sets LOG_LEVEL=silent so pino-http doesn't spam test
  // output; override just long enough to construct a logger that actually
  // emits at 'error'.
  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const testLogger = createLogger(stream);
  process.env.LOG_LEVEL = previousLevel;

  const err = new Error('boom');
  // Simulate an HTTP client attaching debug info to the error object -
  // exactly the shape that would leak a secret via pino's default serializer.
  err.headers = { authorization: 'Bearer sk-super-secret-key' };
  err.request = { apiKey: 'sk-super-secret-key' };

  testLogger.error({ err }, 'Test error');

  const output = stream.chunks.join('');
  assert.ok(output.includes('boom'), 'should log the error message');
  assert.ok(!output.includes('sk-super-secret-key'), 'should never log secret-bearing properties');

  const parsed = JSON.parse(output);
  assert.deepEqual(Object.keys(parsed.err).sort(), ['message', 'stack', 'type']);
});

test('redacts sensitive request headers (x-api-key, authorization, cookie)', () => {
  const stream = captureStream();

  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const testLogger = createLogger(stream);
  process.env.LOG_LEVEL = previousLevel;

  testLogger.info(
    {
      req: {
        headers: {
          host: 'localhost:3000',
          'x-api-key': 'ab1c45288727d1440a3ab9c3db5bb66eee5d9ce1e5b63425',
          authorization: 'Bearer sk-super-secret-key',
          cookie: 'session=super-secret-session-id',
        },
      },
    },
    'request completed'
  );

  const output = stream.chunks.join('');
  assert.ok(!output.includes('ab1c45288727d1440a3ab9c3db5bb66eee5d9ce1e5b63425'), 'x-api-key must be redacted');
  assert.ok(!output.includes('sk-super-secret-key'), 'authorization must be redacted');
  assert.ok(!output.includes('super-secret-session-id'), 'cookie must be redacted');

  const parsed = JSON.parse(output);
  assert.equal(parsed.req.headers.host, 'localhost:3000', 'non-sensitive headers still log');
  assert.ok(!('x-api-key' in parsed.req.headers));
});

test('logError delegates to the shared logger with the error under the "err" key', (t) => {
  t.mock.method(logger, 'error', () => {});

  const err = new Error('delegated');
  logError('Some label', err);

  assert.equal(logger.error.mock.calls.length, 1);
  const [fields, label] = logger.error.mock.calls[0].arguments;
  assert.equal(fields.err, err);
  assert.equal(label, 'Some label');
});
