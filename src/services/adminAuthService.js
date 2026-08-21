const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { OAuth2Client } = require('google-auth-library');

const ADMIN_TOKEN_TTL = '30m';

function issueAdminToken(admin) {
  return jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

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

async function verifyGoogleIdToken(idToken) {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();

  if (!payload.email || payload.email_verified !== true) {
    throw new Error('Unverified Google email');
  }
  return payload.email;
}

module.exports = {
  issueAdminToken,
  verifyAdminToken,
  findAdminByEmail,
  verifyGoogleIdToken,
  isGoogleAuthConfigured,
  ADMIN_TOKEN_TTL,
};
