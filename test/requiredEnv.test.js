const test = require('node:test');
const assert = require('node:assert/strict');
const { getMissingRequiredEnvVars } = require('../src/config/requiredEnv');

test('returns no missing vars when all required env vars are set', () => {
  const missing = getMissingRequiredEnvVars({
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'secret',
  });
  assert.deepEqual(missing, []);
});

test('reports each missing required env var', () => {
  const missing = getMissingRequiredEnvVars({});
  assert.deepEqual(missing, ['DATABASE_URL', 'JWT_SECRET']);
});

test('treats an empty string the same as missing', () => {
  const missing = getMissingRequiredEnvVars({
    DATABASE_URL: '',
    JWT_SECRET: 'secret',
  });
  assert.deepEqual(missing, ['DATABASE_URL']);
});

test('does not require ANTHROPIC_API_KEY - a missing key degrades gracefully per-request instead', () => {
  const missing = getMissingRequiredEnvVars({
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'secret',
  });
  assert.ok(!missing.includes('ANTHROPIC_API_KEY'));
});
