const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

const ORDER_STATUSES = Object.freeze([
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

class ValidationError extends Error {}
class ConflictError extends Error {}

async function getAdminOrders({ status = null, q = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (status !== null && !ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const clampedPageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const clampedPage = Math.max(1, page);
  const offset = (clampedPage - 1) * clampedPageSize;
  const searchTerm = q ? `%${q}%` : null;

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE $2 OR customer_email ILIKE $2)`,
    [status, searchTerm]
  );
  const total = Number(countResult.rows[0].total);

  const { rows: orders } = await pool.query(
    `SELECT * FROM orders
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR order_number ILIKE $2 OR customer_email ILIKE $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [status, searchTerm, clampedPageSize, offset]
  );

  return { orders, total, page: clampedPage, pageSize: clampedPageSize };
}

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

    for (const key of orderCache.keys()) {
      if (key.startsWith(`list:${order.customer_email}:`)) {
        orderCache.delete(key);
      }
    }
  }
  return order;
}

async function updateOrderShipping(orderNumber, { carrier, trackingNumber }) {
  const { rows } = await pool.query(
    'UPDATE orders SET carrier = $1, tracking_number = $2 WHERE order_number = $3 RETURNING *',
    [carrier, trackingNumber, orderNumber]
  );
  const order = rows[0] ?? null;
  if (order) {
    orderCache.delete(`order:${orderNumber}`);

    for (const key of orderCache.keys()) {
      if (key.startsWith(`list:${order.customer_email}:`)) {
        orderCache.delete(key);
      }
    }
  }
  return order;
}

async function refundOrder(orderNumber, { amountCents, restock, reason }) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  const order = rows[0];
  if (!order) return null;

  if (order.refunded_at) {
    throw new ConflictError('This order has already been refunded.');
  }

  if (order.status === 'cancelled') {
    throw new ValidationError('Cannot refund a cancelled order.');
  }

  const totalPaidCents =
    (order.unit_price_cents || 0) + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0);

  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > totalPaidCents) {
    throw new ValidationError(`amount_cents must be a positive integer no greater than ${totalPaidCents}.`);
  }

  const client = await pool.connect();
  let updated;
  try {
    await client.query('BEGIN');

    const { rows: updatedRows } = await client.query(
      `UPDATE orders SET status = 'returned', refund_amount_cents = $1, refund_reason = $2, restocked = false, refunded_at = now()
       WHERE order_number = $3 AND refunded_at IS NULL
       RETURNING *`,
      [amountCents, reason ?? null, orderNumber]
    );
    updated = updatedRows[0];

    if (!updated) {
      throw new ConflictError('This order has already been refunded.');
    }

    let restocked = false;
    if (restock) {
      const restockResult = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity + 1
         WHERE slug = (SELECT slug FROM products WHERE name = $1 ORDER BY slug LIMIT 1)
         RETURNING slug`,
        [order.product_name]
      );
      restocked = restockResult.rows.length > 0;
    }

    if (restocked) {
      const { rows: restockedRows } = await client.query(
        'UPDATE orders SET restocked = true WHERE order_number = $1 RETURNING *',
        [orderNumber]
      );
      if (restockedRows.length > 0) {
        updated.restocked = true;
      }
    }

    await client.query('COMMIT');
  } catch (err) {

    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  orderCache.delete(`order:${orderNumber}`);
  for (const key of orderCache.keys()) {
    if (key.startsWith(`list:${updated.customer_email}:`)) {
      orderCache.delete(key);
    }
  }

  return updated;
}

module.exports = {
  ORDER_STATUSES,
  ValidationError,
  ConflictError,
  getAdminOrders,
  updateOrderStatus,
  updateOrderShipping,
  refundOrder,
};
