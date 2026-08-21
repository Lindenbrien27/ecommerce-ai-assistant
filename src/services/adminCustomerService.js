
const { pool } = require('../config/db');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const TOTAL_SPENT_SQL = `SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) FILTER (WHERE status <> 'cancelled')`;

function normalizeAggregateRow(row) {
  return {
    ...row,
    order_count: Number(row.order_count),
    total_spent_cents: Number(row.total_spent_cents),
  };
}

async function getCustomers({ q = null, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const pageNum = Math.max(1, page);
  const offset = (pageNum - 1) * pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const { rows } = await pool.query(
    `SELECT customer_email,
            COUNT(*) AS order_count,
            ${TOTAL_SPENT_SQL} AS total_spent_cents,
            MAX(created_at) AS last_order_at
     FROM orders
     WHERE ($1::text IS NULL OR customer_email ILIKE $1)
     GROUP BY customer_email
     ORDER BY last_order_at DESC, customer_email ASC
     LIMIT $2 OFFSET $3`,
    [searchTerm, pageSize + 1, offset]
  );

  const hasMore = rows.length > pageSize;
  const customers = (hasMore ? rows.slice(0, pageSize) : rows).map(normalizeAggregateRow);
  return { customers, hasMore };
}

async function getCustomerSummary(email) {
  const { rows } = await pool.query(
    `SELECT customer_email,
            COUNT(*) AS order_count,
            ${TOTAL_SPENT_SQL} AS total_spent_cents,
            MAX(created_at) AS last_order_at
     FROM orders
     WHERE customer_email = $1
     GROUP BY customer_email`,
    [email]
  );
  return rows[0] ? normalizeAggregateRow(rows[0]) : null;
}

module.exports = { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, getCustomers, getCustomerSummary };
