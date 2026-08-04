const { pool } = require('../config/db');

// Every table here is keyed directly by the requester's own JWT email
// (req.customerEmail), so unlike orderService there's no separate id and no
// ownership check to make - the row a customer can read/write is always
// their own. issueToken lowercases before signing (see
// src/controllers/authController.js), but that's a guarantee this layer
// doesn't control, so every query normalizes here too rather than trusting
// callers to have already done it.

async function getProfile(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_profiles WHERE email = $1', [normalized]);
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

async function getAddress(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_addresses WHERE email = $1', [normalized]);
  return (
    rows[0] || {
      email: normalized,
      line1: null,
      line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      phone: null,
    }
  );
}

async function upsertAddress(email, { line1, line2, city, state, postal_code, country, phone }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_addresses (email, line1, line2, city, state, postal_code, country, phone, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (email) DO UPDATE SET
       line1 = $2, line2 = $3, city = $4, state = $5, postal_code = $6, country = $7, phone = $8, updated_at = now()
     RETURNING email, line1, line2, city, state, postal_code, country, phone`,
    [normalized, line1, line2, city, state, postal_code, country, phone]
  );
  return rows[0];
}

async function deleteAddress(email) {
  await pool.query('DELETE FROM customer_addresses WHERE email = $1', [email.toLowerCase()]);
}

async function getPaymentMethod(email) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query('SELECT * FROM customer_payment_methods WHERE email = $1', [normalized]);
  return (
    rows[0] || {
      email: normalized,
      brand: null,
      last4: null,
      expiry_month: null,
      expiry_year: null,
      billing_name: null,
    }
  );
}

async function upsertPaymentMethod(email, { brand, last4, expiry_month, expiry_year, billing_name }) {
  const normalized = email.toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO customer_payment_methods (email, brand, last4, expiry_month, expiry_year, billing_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (email) DO UPDATE SET
       brand = $2, last4 = $3, expiry_month = $4, expiry_year = $5, billing_name = $6, updated_at = now()
     RETURNING email, brand, last4, expiry_month, expiry_year, billing_name`,
    [normalized, brand, last4, expiry_month, expiry_year, billing_name]
  );
  return rows[0];
}

async function deletePaymentMethod(email) {
  await pool.query('DELETE FROM customer_payment_methods WHERE email = $1', [email.toLowerCase()]);
}

module.exports = {
  getProfile,
  upsertProfile,
  getAddress,
  upsertAddress,
  deleteAddress,
  getPaymentMethod,
  upsertPaymentMethod,
  deletePaymentMethod,
};
