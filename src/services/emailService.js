const nodemailer = require('nodemailer');
const { logError } = require('../utils/logger');

// Same "degrades gracefully, nothing else needs to change" pattern as a
// missing ANTHROPIC_API_KEY (see requiredEnv.js) - SMTP_* isn't in
// REQUIRED_ENV_VARS, so the app still starts and the OTP flow still works
// without it, just without actually emailing anyone. isConfigured() lets
// callers (otpController) decide what to do about that instead of this
// module silently no-op'ing in a way that looks like success.
function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Returns whether the email actually went out. Callers must not treat a
// `false` here as a request failure - see the "no enumeration" reasoning in
// otpController.js for why POST /api/auth/otp/request always responds the
// same way regardless of this result.
async function sendOtpEmail(email, code) {
  if (!isConfigured()) return false;

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `${code} is your verification code`,
      text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      html: `<p>Your verification code is <strong style="font-size:1.3em;letter-spacing:0.1em;">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });
    return true;
  } catch (err) {
    logError('Failed to send OTP email', err);
    return false;
  }
}

module.exports = { sendOtpEmail, isConfigured };
