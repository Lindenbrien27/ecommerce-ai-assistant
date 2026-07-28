const crypto = require('crypto');
const { pool } = require('../config/db');

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode() {
  // crypto.randomInt, not Math.random - Math.random isn't a CSPRNG, and a
  // predictable code generator would make the whole point of "prove you
  // control this inbox" moot. Zero-padded so 000512 stays 6 digits.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Always succeeds from the caller's point of view - there is no "this email
// doesn't exist" branch here, deliberately. Whether that email has any
// orders is a question for GET /api/orders once a token exists, not this
// endpoint - answering it here (even implicitly, via a different response)
// would let someone enumerate real customer emails by trying candidates
// against this endpoint.
//
// One row per request, not one row per email (see the migration's own
// comment for the race a shared-row/upsert design caused) - each call
// gets its own independently valid code, so concurrent requests for the
// same email never invalidate each other. Opportunistically clears out
// this email's own already-expired rows first, so a frequently-requesting
// email doesn't accumulate unbounded dead rows between real cleanups.
async function requestOtp(email) {
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  await pool.query('DELETE FROM otp_codes WHERE LOWER(email) = LOWER($1) AND expires_at <= now()', [email]);
  await pool.query(
    'INSERT INTO otp_codes (email, code_hash, expires_at, attempts, created_at) VALUES ($1, $2, $3, 0, now())',
    [email, codeHash, expiresAt]
  );

  return code;
}

const OtpResult = Object.freeze({
  OK: 'ok',
  INVALID: 'invalid',
  LOCKED: 'locked',
});

// Every failure path (no code was ever requested, every outstanding code
// expired, the code is simply wrong) returns the same OtpResult.INVALID -
// same enumeration reasoning as requestOtp: a caller shouldn't be able to
// tell "that email never requested a code" apart from "that email
// requested a code and got the digits wrong" from the response alone.
async function verifyOtp(email, code) {
  const { rows } = await pool.query(
    'SELECT * FROM otp_codes WHERE LOWER(email) = LOWER($1) AND expires_at > now()',
    [email]
  );
  if (rows.length === 0) return OtpResult.INVALID;

  const codeHash = hashCode(code);
  const match = rows.find((row) => row.code_hash === codeHash && row.attempts < MAX_ATTEMPTS);

  if (match) {
    // Only the matched row, not every outstanding code for this email -
    // deleting all of them was the original design here, on the reasoning
    // that a successful verify should end the whole episode. In practice
    // that meant one legitimate, independent, still-in-flight request for
    // the same email (a second tab, or - what actually surfaced this live -
    // this project's own e2e suite running many specs concurrently against
    // one shared seeded test email) got its perfectly valid code deleted
    // out from under it by an unrelated request that happened to finish
    // first, failing it for no reason visible to that flow. Each code is
    // already single-use and short-lived on its own; that's enough.
    await pool.query('DELETE FROM otp_codes WHERE id = $1', [match.id]);
    return OtpResult.OK;
  }

  const stillGuessableBefore = rows.some((row) => row.attempts < MAX_ATTEMPTS);
  if (!stillGuessableBefore) return OtpResult.LOCKED;

  // A wrong guess counts against every outstanding code for this email at
  // once, not just one of them - otherwise the per-code attempt cap would
  // be trivially bypassed by requesting extra codes (N codes outstanding
  // would otherwise mean N * MAX_ATTEMPTS total guesses instead of one
  // shared budget).
  await pool.query(
    'UPDATE otp_codes SET attempts = attempts + 1 WHERE LOWER(email) = LOWER($1) AND expires_at > now()',
    [email]
  );

  const stillGuessableAfter = rows.some((row) => row.attempts + 1 < MAX_ATTEMPTS);
  return stillGuessableAfter ? OtpResult.INVALID : OtpResult.LOCKED;
}

module.exports = { requestOtp, verifyOtp, OtpResult, CODE_TTL_MINUTES, MAX_ATTEMPTS };
