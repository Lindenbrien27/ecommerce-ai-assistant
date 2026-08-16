const { pool } = require('../config/db');
const { orderCache } = require('../config/cache');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

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

  // Not cached (see getAdminOrders' own doc comment below) - this call
  // always hits the database. Two queries, not one COUNT(*) OVER() window
  // function - a zero-row page (filters that match nothing) would silently
  // drop the total along with the rows, since a window function's count
  // rides on a row that no longer exists. A plain COUNT(*) always returns
  // exactly one row regardless of how many orders match.
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

// Refund amount and stock restoration are independent, admin-controlled
// inputs (see this plan's own Global Constraints) - a partial refund
// doesn't imply the item came back, and restocking never happens without
// the admin explicitly asking for it. 'returned' is set directly here,
// not through updateOrderStatus/ORDER_STATUSES - that allowlist
// deliberately excludes it, so this is the only path that can set it.
async function refundOrder(orderNumber, { amountCents, restock, reason }) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  const order = rows[0];
  if (!order) return null;

  if (order.refunded_at) {
    throw new ConflictError('This order has already been refunded.');
  }

  // The one status precondition this endpoint has. Refund amount and
  // restock stay independent admin choices for every other status (a
  // 'processing' order can absolutely be refunded), but a cancelled order
  // was never delivered - flipping it to 'returned' would overwrite the
  // fact that it was cancelled with a return that never happened.
  if (order.status === 'cancelled') {
    throw new ValidationError('Cannot refund a cancelled order.');
  }

  const totalPaidCents =
    (order.unit_price_cents || 0) + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0);

  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > totalPaidCents) {
    throw new ValidationError(`amount_cents must be a positive integer no greater than ${totalPaidCents}.`);
  }

  // The first money+inventory flow in this codebase, and the only one where
  // a partial failure is unrecoverable: the guarded UPDATE below makes a
  // second refund attempt a 409 forever, so if the restock landed but the
  // `restocked = true` write didn't, the order would permanently claim the
  // stock never came back and an admin could double-restock it by hand.
  // All three writes therefore run on one checked-out client inside a real
  // transaction (pool.query hands out an arbitrary pooled client per call,
  // so BEGIN/COMMIT through it would not be scoped to the same connection).
  const client = await pool.connect();
  let updated;
  try {
    await client.query('BEGIN');

    // Update the order first with a guarded UPDATE - only proceed with restock
    // if this request actually wins the concurrency race. This ensures two
    // concurrent refund requests don't both increment stock.
    const { rows: updatedRows } = await client.query(
      `UPDATE orders SET status = 'returned', refund_amount_cents = $1, refund_reason = $2, restocked = false, refunded_at = now()
       WHERE order_number = $3 AND refunded_at IS NULL
       RETURNING *`,
      [amountCents, reason ?? null, orderNumber]
    );
    updated = updatedRows[0];

    // Guarded UPDATE detected a concurrent refund: the order existed per the
    // initial SELECT, but refunded_at is no longer NULL. This means another
    // request refunded it between our SELECT and UPDATE.
    if (!updated) {
      throw new ConflictError('This order has already been refunded.');
    }

    // Products aren't linked to orders by a foreign key (see this plan's
    // own Global Constraints) - only attempt restocking after we've confirmed
    // this request won the race (guarded UPDATE succeeded). Matches by name,
    // and simply reports false rather than erroring if nothing matches (the
    // product may have been renamed or deleted since this order was placed).
    //
    // `products.name` is NOT unique (only `slug` - the primary key - and
    // `sku` are), and the admin product-create UI happily allows two rows
    // to share a name (colorway variants, for example). A bare
    // `WHERE name = $1` would credit a stock unit to every one of them for
    // a single returned item, so the match is narrowed to exactly one row
    // via its primary key, picked deterministically by slug.
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

    // If restocking happened, update the order row to reflect that.
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
    // Best-effort: if the connection itself is what failed, ROLLBACK will
    // fail too - the original error is the one worth reporting, and an
    // uncommitted transaction on a broken connection is rolled back by the
    // server anyway.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Same cache-invalidation reasoning updateOrderStatus/updateOrderShipping
  // already document - this write changes status too, so it needs the
  // identical treatment.
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
