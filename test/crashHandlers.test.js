const test = require('node:test');
const assert = require('node:assert/strict');
const Sentry = require('@sentry/node');
const { logger } = require('../src/config/logger');
const { registerCrashHandlers } = require('../src/config/crashHandlers');

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

// process.on is mocked here rather than actually registering (and then
// emitting) real 'uncaughtException'/'unhandledRejection' events - Node's
// own test runner installs its own listener for the former specifically to
// detect genuine crashes during a test run, and process.emit(...) would
// trigger that too, failing this test for the wrong reason. Capturing the
// callback registerCrashHandlers() hands to process.on and invoking it
// directly exercises the exact same handler logic without going anywhere
// near the real process event.
function captureHandler(t, eventName) {
  const onMock = t.mock.method(process, 'on', () => {});
  registerCrashHandlers();
  const call = onMock.mock.calls.find((c) => c.arguments[0] === eventName);
  return call.arguments[1];
}

test('uncaughtException handler logs, reports to Sentry, flushes, and exits(1)', async (t) => {
  const fatalMock = t.mock.method(logger, 'fatal', () => {});
  const captureMock = t.mock.method(Sentry, 'captureException', () => {});
  t.mock.method(Sentry, 'flush', async () => true);
  const exitMock = t.mock.method(process, 'exit', () => {});

  const handler = captureHandler(t, 'uncaughtException');

  const err = new Error('boom');
  handler(err);
  await settle();

  assert.equal(fatalMock.mock.callCount(), 1);
  assert.equal(captureMock.mock.callCount(), 1);
  assert.equal(captureMock.mock.calls[0].arguments[0], err);
  assert.equal(exitMock.mock.callCount(), 1);
  assert.equal(exitMock.mock.calls[0].arguments[0], 1);
});

test('unhandledRejection handler with a non-Error reason still reports a real Error to Sentry', async (t) => {
  t.mock.method(logger, 'fatal', () => {});
  const captureMock = t.mock.method(Sentry, 'captureException', () => {});
  t.mock.method(Sentry, 'flush', async () => true);
  t.mock.method(process, 'exit', () => {});

  const handler = captureHandler(t, 'unhandledRejection');

  handler('a rejected string, not an Error', Promise.resolve());
  await settle();

  assert.equal(captureMock.mock.callCount(), 1);
  const reported = captureMock.mock.calls[0].arguments[0];
  assert.ok(reported instanceof Error);
  assert.equal(reported.message, 'a rejected string, not an Error');
});
