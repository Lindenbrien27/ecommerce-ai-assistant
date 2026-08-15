const { pool } = require('../config/db');

async function getProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at ASC');
  return rows;
}

async function getProductBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  return rows[0] ?? null;
}

module.exports = { getProducts, getProductBySlug };
