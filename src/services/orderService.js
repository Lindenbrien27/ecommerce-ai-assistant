const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class InvalidCursorError extends Error {}

// Orders are effectively read-only (see config/cache.js), and getOrderByNumber
// specifically sits on three separate hot paths - auth verification
// (authService.verifyCustomer), GET /api/orders/:id, and the chat tool
// get_order_by_number - so caching here benefits all three from one place
// instead of each call site needing its own. `.has()` before `.get()`
// because a cached "not found" is a real, valid, deliberately-cached
// result (a `null`) - `cache.get(key) ?? fallback` would be wrong here,
// since `null` is falsy and indistinguishable from "never cached."
async function getOrderByNumber(orderNumber) {
  const cacheKey = `order:${orderNumber}`;
  if (orderCache.has(cacheKey)) return orderCache.get(cacheKey);

  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  const order = rows[0] ?? null;
  orderCache.set(cacheKey, order);
  return order;
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
  // Found in a security review: a well-typed but nonsensical cursor (a
  // string createdAt that isn't a real date, or a non-integer id) used to
  // reach the query below and fail there instead - Postgres rejecting an
  // invalid ::timestamptz literal, or an out-of-range integer, surfaces as
  // an uncaught error from pool.query(), which the controller can't tell
  // apart from InvalidCursorError and reports as a 500. Not exploitable -
  // this is a bind parameter, never concatenated into the query text - but
  // a malformed client cursor should never look like a server fault, and
  // shouldn't be able to spam error-level logs on demand either.
  if (
    !decoded ||
    typeof decoded.createdAt !== 'string' ||
    Number.isNaN(Date.parse(decoded.createdAt)) ||
    !Number.isInteger(decoded.id)
  ) {
    throw new InvalidCursorError('Invalid cursor');
  }
  return decoded;
}

async function getOrdersByEmail(email, { limit = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  // Keyed on the clamped pageSize and the cursor's own opaque string, not
  // the decoded value - equivalent requests (e.g. limit=999 and limit=100,
  // both clamped the same way) share one cache entry instead of one each,
  // and the cursor doesn't need decoding (which can throw) just to check
  // the cache.
  const cacheKey = `list:${email}:${pageSize}:${cursor ?? ''}`;
  if (orderCache.has(cacheKey)) return orderCache.get(cacheKey);

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

  const result = { orders, nextCursor };
  orderCache.set(cacheKey, result);
  return result;
}

async function getOrderByTrackingNumber(trackingNumber) {
  const cacheKey = `tracking:${trackingNumber}`;
  if (orderCache.has(cacheKey)) return orderCache.get(cacheKey);

  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE tracking_number = $1',
    [trackingNumber]
  );
  const order = rows[0] ?? null;
  orderCache.set(cacheKey, order);
  return order;
}

module.exports = {
  getOrderByNumber,
  getOrdersByEmail,
  getOrderByTrackingNumber,
  InvalidCursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
