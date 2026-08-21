const crypto = require('crypto');
const { pool } = require('../config/db');

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode() {

  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

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

async function verifyOtp(email, code) {
  const { rows } = await pool.query(
    'SELECT * FROM otp_codes WHERE LOWER(email) = LOWER($1) AND expires_at > now()',
    [email]
  );
  if (rows.length === 0) return OtpResult.INVALID;

  const codeHash = hashCode(code);
  const match = rows.find((row) => row.code_hash === codeHash && row.attempts < MAX_ATTEMPTS);

  if (match) {

    await pool.query('DELETE FROM otp_codes WHERE id = $1', [match.id]);
    return OtpResult.OK;
  }

  const stillGuessableBefore = rows.some((row) => row.attempts < MAX_ATTEMPTS);
  if (!stillGuessableBefore) return OtpResult.LOCKED;

  await pool.query(
    'UPDATE otp_codes SET attempts = attempts + 1 WHERE LOWER(email) = LOWER($1) AND expires_at > now()',
    [email]
  );

  const stillGuessableAfter = rows.some((row) => row.attempts + 1 < MAX_ATTEMPTS);
  return stillGuessableAfter ? OtpResult.INVALID : OtpResult.LOCKED;
}

module.exports = { requestOtp, verifyOtp, OtpResult, CODE_TTL_MINUTES, MAX_ATTEMPTS };
