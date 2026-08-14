const {
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  findAdminByEmail,
  issueAdminToken,
} = require('../services/adminAuthService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const ADMIN_COOKIE_NAME = 'adminToken';
// Matches adminAuthService's ADMIN_TOKEN_TTL (30m) - the cookie shouldn't
// outlive the JWT it carries.
const ADMIN_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_COOKIE_MAX_AGE_MS,
  };
}

// Unlike requestOtpHandler's deliberate "always the same response" shape
// (authController.js), a 403 here is fine and doesn't need to be
// enumeration-safe: the caller already proved they own a real email via a
// Google-signed token before this branch is ever reached, so there's no
// guessing surface a 403-vs-200 distinction could leak.
async function googleLoginHandler(req, res) {
  if (!isGoogleAuthConfigured()) {
    return res.status(500).json({ error: 'Admin login is not configured.' });
  }

  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required.' });
  }

  let email;
  try {
    email = await verifyGoogleIdToken(idToken);
  } catch (err) {
    auditLog('admin.auth.google_token_rejected', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid Google sign-in.' });
  }

  try {
    const admin = await findAdminByEmail(email);
    if (!admin) {
      auditLog('admin.auth.not_allowlisted', { email: email.toLowerCase(), ip: req.ip });
      return res.status(403).json({ error: 'Not authorized.' });
    }

    auditLog('admin.auth.login_succeeded', { email: admin.email.toLowerCase(), ip: req.ip });
    const token = issueAdminToken(admin);
    res.cookie(ADMIN_COOKIE_NAME, token, adminCookieOptions());
    res.json({ email: admin.email });
  } catch (err) {
    logError('Admin login error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

function meHandler(req, res) {
  res.json({ email: req.adminEmail });
}

function logoutHandler(req, res) {
  // maxAge deliberately omitted here - clearCookie already expires the
  // cookie immediately on its own, and passing maxAge alongside it is
  // deprecated as of Express 4.19 (will be ignored outright in v5). The
  // other attributes (httpOnly/secure/sameSite) still need to match
  // adminCookieOptions() exactly, or the browser won't recognize this as
  // the same cookie to clear.
  const { maxAge, ...clearCookieOptions } = adminCookieOptions();
  res.clearCookie(ADMIN_COOKIE_NAME, clearCookieOptions);
  res.json({ ok: true });
}

module.exports = { googleLoginHandler, meHandler, logoutHandler, ADMIN_COOKIE_NAME };
