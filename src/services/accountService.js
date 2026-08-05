const { pool } = require('../config/db');

// Keyed directly by the requester's own JWT email (req.customerEmail), so
// unlike orderService there's no separate id and no ownership check to
// make - the row a customer can read/write is always their own. issueToken
// lowercases before signing (see src/controllers/authController.js), but
// that's a guarantee this layer doesn't control, so every query normalizes
// here too rather than trusting callers to have already done it.

async function getProfile(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT email, name, username, role, bio, photo_url FROM customer_profiles WHERE email = $1', [normalized]);
  return (
    rows[0] || { email: normalized, name: null, username: null, role: null, bio: null, photo_url: null }
  );
}

async function upsertProfile(email, { name, username, role, bio, photo_url }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_profiles (email, name, username, role, bio, photo_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (email) DO UPDATE SET
       name = $2, username = $3, role = $4, bio = $5, photo_url = $6, updated_at = now()
     RETURNING email, name, username, role, bio, photo_url`,
    [normalized, name, username, role, bio, photo_url]
  );
  return rows[0];
}

module.exports = {
  getProfile,
  upsertProfile,
};
