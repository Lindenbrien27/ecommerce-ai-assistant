const { pool } = require('../config/db');

const PRODUCT_COLUMNS =
  'slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways, specs, created_at, updated_at';

async function getProducts() {

  const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY created_at ASC, slug ASC`);
  return rows;
}

async function getProductBySlug(slug) {
  const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

module.exports = { getProducts, getProductBySlug };
