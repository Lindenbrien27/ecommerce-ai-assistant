const { issueToken } = require('../services/authService');
const { requestOtp, verifyOtp, OtpResult, CODE_TTL_MINUTES } = require('../services/otpService');
const { sendOtpEmail } = require('../services/emailService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Always the same response shape regardless of whether this email has ever
// placed an order, or whether the email actually sent - see otpService's
// own comment for why. devCode only ever appears outside production, and
// only when there's no real email provider configured to have sent it
// instead - the same "convenient in dev/CI, impossible in prod" shape this
// app already uses for other things (e.g. the ANTHROPIC_API_KEY-missing
// path degrading instead of the app refusing to start).
async function requestOtpHandler(req, res) {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
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

module.exports = { requestOtpHandler, verifyOtpHandler };
