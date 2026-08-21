const {
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  findAdminByEmail,
  issueAdminToken,
} = require('../services/adminAuthService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const ADMIN_COOKIE_NAME = 'adminToken';

const ADMIN_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_COOKIE_MAX_AGE_MS,
  };
}

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

  const { maxAge, ...clearCookieOptions } = adminCookieOptions();
  res.clearCookie(ADMIN_COOKIE_NAME, clearCookieOptions);
  res.json({ ok: true });
}

module.exports = { googleLoginHandler, meHandler, logoutHandler, ADMIN_COOKIE_NAME };
