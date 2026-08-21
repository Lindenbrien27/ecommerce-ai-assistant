const { pool } = require('../config/db');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

const STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

class ValidationError extends Error {}

function clamp({ page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE),
  };
}

async function getReviews({ q = null, status = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const where = `
    WHERE ($1::text IS NULL OR r.status = $1)
      AND ($2::text IS NULL OR r.title ILIKE $2 OR r.body ILIKE $2 OR r.author_name ILIKE $2 OR p.name ILIKE $2)
  `;
  const params = [status, searchTerm];

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM product_reviews r JOIN products p ON p.slug = r.product_slug ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows: reviews } = await pool.query(
    `SELECT r.id, r.product_slug, p.name AS product_name, p.icon AS product_icon,
            r.author_name, r.is_guest, r.rating, r.title, r.body, r.status, r.created_at
     FROM product_reviews r
     JOIN products p ON p.slug = r.product_slug
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $3 OFFSET $4`,
    [...params, clamped.pageSize, offset]
  );

  const pendingCountResult = await pool.query("SELECT COUNT(*) AS total FROM product_reviews WHERE status = 'pending'");
  const totalCountResult = await pool.query('SELECT COUNT(*) AS total FROM product_reviews');

  return {
    reviews,
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    pendingCount: Number(pendingCountResult.rows[0].total),
    totalCount: Number(totalCountResult.rows[0].total),
  };
}

async function updateReviewStatus(id, status) {
  if (!STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of: ${STATUSES.join(', ')}`);
  }
  const { rows } = await pool.query(
    'UPDATE product_reviews SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return rows[0] || null;
}

async function deleteReview(id) {
  const { rows } = await pool.query('DELETE FROM product_reviews WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

module.exports = { getReviews, updateReviewStatus, deleteReview, ValidationError, STATUSES };
