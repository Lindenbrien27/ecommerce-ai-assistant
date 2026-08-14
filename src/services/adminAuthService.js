const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { OAuth2Client } = require('google-auth-library');

// Half the customer token's 1h TTL (authService.js) - an admin session is a
// higher-value target (can edit the catalog), so it stays valid for a
// shorter window even though nothing here can revoke it early once issued.
const ADMIN_TOKEN_TTL = '30m';

function issueAdminToken(admin) {
  return jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

// Throws on anything wrong with the token, same "throws, caller catches"
// contract authService.js's verifyToken already uses. The role check is
// what keeps a customer token (a structurally valid JWT signed with the
// same JWT_SECRET) from ever satisfying requireAdminAuth.
function verifyAdminToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload.role !== 'admin') {
    throw new Error('Not an admin token');
  }
  return payload;
}

async function findAdminByEmail(email) {
  const { rows } = await pool.query('SELECT id, email FROM admins WHERE LOWER(email) = LOWER($1)', [email]);
  return rows[0] || null;
}

// Same "isConfigured() lets the caller decide" shape as emailService.js's
// SMTP check - a missing GOOGLE_CLIENT_ID degrades POST /api/admin/auth/google
// to a clear 500 (see adminAuthController.js) instead of the app failing to
// start, since nothing else in this app depends on it.
function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

let googleClient = null;
function getGoogleClient() {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

// Throws if the token's signature, audience, or expiry don't check out -
// callers are expected to catch this, the same "throws, caller catches"
// contract verifyToken/verifyAdminToken above already use. audience is
// re-read from process.env at call time (not captured at client-construction
// time), so a test that sets GOOGLE_CLIENT_ID after this module first loads
// still gets checked against the current value.
async function verifyGoogleIdToken(idToken) {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload().email;
}

module.exports = {
  issueAdminToken,
  verifyAdminToken,
  findAdminByEmail,
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  ADMIN_TOKEN_TTL,
};
