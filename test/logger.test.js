const test = require('node:test');
const assert = require('node:assert/strict');
const { logError } = require('../src/utils/logger');

test('logError logs the message and stack but never dumps the raw error object', (t) => {
  const calls = [];
  t.mock.method(console, 'error', (...args) => {
    calls.push(args.join(' '));
  });

  const err = new Error('boom');
  // Simulate an HTTP client attaching debug info to the error object -
  // exactly the shape that would leak a secret via a blind console.error(err).
  err.headers = { authorization: 'Bearer sk-super-secret-key' };
  err.request = { apiKey: 'sk-super-secret-key' };

  logError('Test error', err);

  const logged = calls.join('\n');
  assert.ok(logged.includes('boom'), 'should log the error message');
  assert.ok(!logged.includes('sk-super-secret-key'), 'should never log secret-bearing properties');
});

test('logError handles non-Error values without throwing', (t) => {
  const calls = [];
  t.mock.method(console, 'error', (...args) => {
    calls.push(args.join(' '));
  });

  logError('Test error', 'a plain string failure');

  const logged = calls.join('\n');
  assert.ok(logged.includes('a plain string failure'));
});
