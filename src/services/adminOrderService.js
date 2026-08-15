const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');
const {
  encodeCursor,
  decodeCursor,
  InvalidCursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./orderService');

// The five real values in the `orders.status` CHECK constraint
// (migrations/1784973065584_initial-schema.sql) - no 'pending', no
// 'completed', and an extra 'out_for_delivery' step that components.md's
// wording didn't account for. Frozen so a caller can't accidentally
// mutate the allowlist.
const ORDER_STATUSES = Object.freeze([
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

async function getAdminOrders({ status = null, q = null, limit = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
  if (status !== null && !ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const after = cursor ? decodeCursor(cursor) : null;
  const searchTerm = q ? `%${q}%` : null;

  // Not cached (see getAdminOrders' own doc comment below) - this call
  // always hits the database.
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE $2 OR customer_email ILIKE $2)
       AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4))
     ORDER BY created_at DESC, id DESC
     LIMIT $5`,
    [status, searchTerm, after?.createdAt ?? null, after?.id ?? null, pageSize + 1]
  );

  const hasMore = rows.length > pageSize;
  const orders = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? encodeCursor(orders[orders.length - 1]) : null;

  return { orders, nextCursor };
}

// The one write path in this file - config/cache.js documents orderCache
// as safe because "nothing exposed here ever writes to it," anticipating
// exactly this as the future exception. getOrderByNumber (orderService.js)
// and the chat tool get_order_by_number both read through the same
// `order:${orderNumber}` cache key, so without this delete a customer or
// the chat tool could keep seeing the pre-update status for up to
// orderCache's 60s TTL after an admin changes it.
async function updateOrderStatus(orderNumber, status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const { rows } = await pool.query(
    'UPDATE orders SET status = $1 WHERE order_number = $2 RETURNING *',
    [status, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) {
    orderCache.delete(`order:${orderNumber}`);
    // The customer's order-history list (orderService.getOrdersByEmail, reused
    // by the admin customer-detail page) caches under a different key shape
    // (`list:${email}:${pageSize}:${cursor}`) that the single-order delete
    // above doesn't touch - without this, an admin editing an order from a
    // customer's detail page can navigate back to that same page and still
    // see the pre-edit status/tracking for up to the cache's TTL.
    for (const key of orderCache.keys()) {
      if (key.startsWith(`list:${order.customer_email}:`)) {
        orderCache.delete(key);
      }
    }
  }
  return order;
}

// The second write path through this file - same cache-invalidation
// reasoning updateOrderStatus already established (see its own comment
// above): getOrderByNumber and the chat tool both read through the same
// `order:${orderNumber}` cache key, so a carrier/tracking change needs
// the identical treatment.
async function updateOrderShipping(orderNumber, { carrier, trackingNumber }) {
  const { rows } = await pool.query(
    'UPDATE orders SET carrier = $1, tracking_number = $2 WHERE order_number = $3 RETURNING *',
    [carrier, trackingNumber, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) {
    orderCache.delete(`order:${orderNumber}`);
    // The customer's order-history list (orderService.getOrdersByEmail, reused
    // by the admin customer-detail page) caches under a different key shape
    // (`list:${email}:${pageSize}:${cursor}`) that the single-order delete
    // above doesn't touch - without this, an admin editing an order from a
    // customer's detail page can navigate back to that same page and still
    // see the pre-edit status/tracking for up to the cache's TTL.
    for (const key of orderCache.keys()) {
      if (key.startsWith(`list:${order.customer_email}:`)) {
        orderCache.delete(key);
      }
    }
  }
  return order;
}

module.exports = {
  ORDER_STATUSES,
  InvalidCursorError,
  getAdminOrders,
  updateOrderStatus,
  updateOrderShipping,
};
