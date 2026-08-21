const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class InvalidCursorError extends Error {}

function toCustomerOrder(order) {
  if (!order) return order;
  const { refund_reason: _internalRefundReason, ...customerFields } = order;
  return customerFields;
}

async function getOrderByNumber(orderNumber) {
  const cacheKey = `order:${orderNumber}`;
  if (orderCache.has(cacheKey)) return orderCache.get(cacheKey);

  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  const order = rows[0] ?? null;
  orderCache.set(cacheKey, order);
  return order;
}

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
  toCustomerOrder,
  InvalidCursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  encodeCursor,
  decodeCursor,
};
