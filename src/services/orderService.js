const { pool } = require('../config/db');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class InvalidCursorError extends Error {}

async function getOrderByNumber(orderNumber) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  return rows[0] ?? null;
}

// Keyset (a.k.a. cursor) pagination on (created_at, id) rather than OFFSET -
// OFFSET forces Postgres to scan and discard every prior row, which gets
// linearly slower as a customer's order history grows. A composite index on
// (customer_email, created_at DESC, id DESC) makes this a direct index
// seek regardless of page depth. id is the tie-breaker since created_at
// alone isn't guaranteed unique.
function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id }), 'utf8').toString(
    'base64url'
  );
}

function decodeCursor(cursor) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError('Invalid cursor');
  }
  if (!decoded || typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'number') {
    throw new InvalidCursorError('Invalid cursor');
  }
  return decoded;
}

async function getOrdersByEmail(email, { limit = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const after = cursor ? decodeCursor(cursor) : null;

  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE customer_email = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3))
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [email, after?.createdAt ?? null, after?.id ?? null, pageSize + 1]
  );

  const hasMore = rows.length > pageSize;
  const orders = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? encodeCursor(orders[orders.length - 1]) : null;

  return { orders, nextCursor };
}

async function getOrderByTrackingNumber(trackingNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE tracking_number = $1',
    [trackingNumber]
  );
  return rows[0] ?? null;
}

module.exports = {
  getOrderByNumber,
  getOrdersByEmail,
  getOrderByTrackingNumber,
  InvalidCursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
