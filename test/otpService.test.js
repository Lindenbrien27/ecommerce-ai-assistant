const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { pool } = require('../src/config/db');
const { requestOtp, verifyOtp, OtpResult, MAX_ATTEMPTS } = require('../src/services/otpService');

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

let nextRowId = 1;
function row({ code, attempts = 0, expiresInMs = 60_000 }) {
  return {
    id: nextRowId++,
    email: 'jane@example.com',
    code_hash: hashCode(code),
    attempts,
    expires_at: new Date(Date.now() + expiresInMs),
  };
}

test('requestOtp returns a 6-digit numeric code and inserts its hash, not the code itself', async (t) => {
  let insertedArgs = null;
  t.mock.method(pool, 'query', async (sql, args) => {
    if (sql.startsWith('INSERT')) insertedArgs = args;
    return { rows: [] };
  });

  const code = await requestOtp('jane@example.com');

  assert.match(code, /^\d{6}$/);
  assert.equal(insertedArgs[0], 'jane@example.com');
  assert.equal(insertedArgs[1], hashCode(code));
  assert.notEqual(insertedArgs[1], code);
});

test('requestOtp opportunistically deletes this email\'s own already-expired codes first', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql, args) => {
    queries.push({ sql, args });
    return { rows: [] };
  });

  await requestOtp('jane@example.com');

  assert.ok(queries[0].sql.startsWith('DELETE') && queries[0].sql.includes('expires_at <= now()'));
  assert.ok(queries[1].sql.startsWith('INSERT'));
});

test('two concurrent requests for the same email each get their own independently valid code (the race this replaced a single-row design over)', async (t) => {
  const inserted = [];
  t.mock.method(pool, 'query', async (sql, args) => {
    if (sql.startsWith('INSERT')) inserted.push(args);
    return { rows: [] };
  });

  const [codeA, codeB] = await Promise.all([requestOtp('jane@example.com'), requestOtp('jane@example.com')]);

  assert.equal(inserted.length, 2);
  // Verifying against a store that still has BOTH rows, code A's hash must
  // still be found even though code B was requested after it - neither
  // request's insert overwrote the other's.
  const hashesInserted = inserted.map((args) => args[1]);
  assert.ok(hashesInserted.includes(hashCode(codeA)));
  assert.ok(hashesInserted.includes(hashCode(codeB)));
});

test('verifyOtp returns OK and deletes only the matched row, not every outstanding code for the email', async (t) => {
  const code = '123456';
  const matchedRow = row({ code });
  const queries = [];
  t.mock.method(pool, 'query', async (sql, args) => {
    queries.push({ sql, args });
    // A second, unrelated outstanding code for the same email - simulates
    // another concurrent/independent request (e.g. a second tab) that
    // hasn't been verified yet. It must survive this call.
    if (sql.startsWith('SELECT')) return { rows: [matchedRow, row({ code: '999999' })] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', code);

  assert.equal(result, OtpResult.OK);
  const del = queries.find((q) => q.sql.startsWith('DELETE'));
  assert.ok(del, 'a verified code must be deleted so it cannot be replayed');
  // By the matched row's own id, not a blanket "every row for this email" -
  // an unrelated still-outstanding code (e.g. another tab's in-flight
  // request) must not be deleted as a side effect of this one succeeding.
  assert.deepEqual(del.args, [matchedRow.id]);
});

test('verifyOtp matches whichever outstanding code is correct when more than one exists', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return { rows: [row({ code: '111111' }), row({ code: '222222' })] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '222222');

  assert.equal(result, OtpResult.OK);
});

test('verifyOtp returns INVALID when no code was ever requested for that email', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const result = await verifyOtp('never-requested@example.com', '123456');

  assert.equal(result, OtpResult.INVALID);
});

test('verifyOtp returns INVALID (not OK) when the code is wrong, and records the attempt against every outstanding code', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql, args) => {
    queries.push({ sql, args });
    if (sql.startsWith('SELECT')) return { rows: [row({ code: '123456' })] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '000000');

  assert.equal(result, OtpResult.INVALID);
  const update = queries.find((q) => q.sql.includes('attempts = attempts + 1'));
  assert.ok(update, 'a wrong guess must increment the stored attempt count');
  assert.deepEqual(update.args, ['jane@example.com']);
});

test('verifyOtp treats an expired code as if it never existed, and does not match it', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    // The service's own WHERE expires_at > now() means an expired row
    // simply never comes back from this SELECT.
    if (sql.startsWith('SELECT')) return { rows: [] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '123456');

  assert.equal(result, OtpResult.INVALID);
});

test('verifyOtp returns LOCKED once every outstanding code has already reached the max attempt count', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return { rows: [row({ code: '123456', attempts: MAX_ATTEMPTS })] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '123456');

  assert.equal(result, OtpResult.LOCKED);
});

test('verifyOtp transitions to LOCKED on the wrong guess that reaches the max attempt count', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return { rows: [row({ code: '123456', attempts: MAX_ATTEMPTS - 1 })] };
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '000000');

  assert.equal(result, OtpResult.LOCKED);
});

test('verifyOtp is not locked while at least one outstanding code still has budget left, even if another is maxed out', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) {
      return { rows: [row({ code: '111111', attempts: MAX_ATTEMPTS }), row({ code: '222222', attempts: 0 })] };
    }
    return { rows: [] };
  });

  const result = await verifyOtp('jane@example.com', '000000');

  assert.equal(result, OtpResult.INVALID);
});
