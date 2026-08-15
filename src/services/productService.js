const { pool } = require('../config/db');

// Explicit column list (not SELECT *) so a future column added to
// products isn't published to these public/no-auth reads automatically -
// adding a new column here is an opt-in decision, not a side effect.
const PRODUCT_COLUMNS =
  'slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways, created_at, updated_at';

async function getProducts() {
  // Secondary sort on slug breaks ties on created_at - the backfill
  // migration inserts all seed rows in one statement, so they share an
  // identical created_at (Postgres now() is transaction/statement-scoped),
  // which otherwise leaves default ordering up to the query planner. Same
  // convention as adminOrderService.js/orderService.js (created_at DESC,
  // id DESC) and adminCustomerService.js (last_order_at DESC,
  // customer_email ASC).
  const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY created_at ASC, slug ASC`);
  return rows;
}

async function getProductBySlug(slug) {
  const { rows } = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

module.exports = { getProducts, getProductBySlug };
