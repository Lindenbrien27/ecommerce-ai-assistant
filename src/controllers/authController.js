const { issueToken } = require('../services/authService');
const { requestOtp, verifyOtp, OtpResult, CODE_TTL_MINUTES } = require('../services/otpService');
const { sendOtpEmail } = require('../services/emailService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

// [^\s@]+ on both sides of a literal \. that character class can also
// match is a classic ReDoS shape (CodeQL js/polynomial-redos) - on a
// failing match like "x@" + "!.".repeat(50), the engine backtracks
// through every possible split point between the two +'s and the literal
// dot. EMAIL_RE here has no @ inside either segment, so it can't be
// ambiguous the same way; the "must contain a dot" requirement is
// re-checked as a plain substring search in isValidEmail below instead of
// being folded back into the regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
// RFC 5321's own cap, and cheap insurance regardless of the regex fix
// above - no legitimate email is longer than this, so rejecting first
// keeps every check below working on a bounded string.
const EMAIL_MAX_LENGTH = 254;

function isValidEmail(email) {
  if (typeof email !== 'string' || email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  if (!EMAIL_RE.test(email)) return false;
  const domain = email.slice(email.indexOf('@') + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

// Always the same response shape regardless of whether this email has ever
// placed an order, or whether the email actually sent - see otpService's
// own comment for why. devCode only ever appears outside production, and
// only when there's no real email provider configured to have sent it
// instead - the same "convenient in dev/CI, impossible in prod" shape this
// app already uses for other things (e.g. the ANTHROPIC_API_KEY-missing
// path degrading instead of the app refusing to start).
async function requestOtpHandler(req, res) {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  try {
    const code = await requestOtp(email);
    const sent = await sendOtpEmail(email, code);
    auditLog('auth.otp_requested', { email: email.toLowerCase(), sent, ip: req.ip });

    const body = { message: `If that email has an account, we've sent it a code. It expires in ${CODE_TTL_MINUTES} minutes.` };
    if (process.env.NODE_ENV !== 'production' && !sent) {
      body.devCode = code;
    }
    res.json(body);
  } catch (err) {
    logError('OTP request error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function verifyOtpHandler(req, res) {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'email and code are required' });
  }

  try {
    const result = await verifyOtp(email, code);

    if (result === OtpResult.LOCKED) {
      auditLog('auth.otp_locked', { email: email.toLowerCase(), ip: req.ip });
      return res.status(401).json({ error: 'Too many incorrect attempts. Request a new code and try again.' });
    }

    if (result === OtpResult.INVALID) {
      auditLog('auth.otp_verify_failed', { email: email.toLowerCase(), ip: req.ip });
      return res.status(401).json({ error: "That code isn't right or has expired. Request a new one and try again." });
    }

    auditLog('auth.otp_verify_succeeded', { email: email.toLowerCase(), ip: req.ip });
    const token = issueToken(email.toLowerCase());
    res.json({ token });
  } catch (err) {
    logError('OTP verify error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// EMAIL_RE is exported alongside isValidEmail solely so a test can prove
// the regex construction itself is safe against pathological input,
// independent of isValidEmail's own length gate - the length check alone
// already keeps every real call site safe, but it shouldn't be the only
// thing standing between this regex and a catastrophic-backtracking input.
module.exports = { requestOtpHandler, verifyOtpHandler, isValidEmail, EMAIL_RE };
