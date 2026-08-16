const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const adminOrderService = require('../src/services/adminOrderService');

test.beforeEach(() => orderCache.clear());

test('getAdminOrders queries across all customers with no email filter', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.doesNotMatch(sql, /customer_email = \$/);
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '1' }] };
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return { rows: [{ order_number: 'ORD-1001' }] };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders();
  assert.equal(orders.length, 1);
  assert.equal(total, 1);
  assert.equal(page, 1);
  assert.equal(pageSize, 20);
});

test('getAdminOrders filters by status when provided', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /status = \$1/);
    assert.equal(params[0], 'shipped');
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminOrderService.getAdminOrders({ status: 'shipped' });
});

test('getAdminOrders rejects a status that is not one of the five real values', async (t) => {
  await assert.rejects(adminOrderService.getAdminOrders({ status: 'pending' }));
});

test('getAdminOrders searches order_number and customer_email with q', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /order_number ILIKE/);
    assert.match(sql, /customer_email ILIKE/);
    assert.ok(params.includes('%ORD-1001%'));
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminOrderService.getAdminOrders({ q: 'ORD-1001' });
});

test('getAdminOrders paginates using LIMIT/OFFSET derived from page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '5' }] };
    assert.match(sql, /LIMIT \$3 OFFSET \$4/);
    assert.deepEqual(params.slice(2), [2, 2]); // pageSize 2, page 2 -> offset (2-1)*2 = 2
    return {
      rows: [
        { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
        { order_number: 'ORD-1001', created_at: '2026-01-01T00:00:00Z', id: 1 },
      ],
    };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders({ page: 2, pageSize: 2 });
  assert.equal(orders.length, 2);
  assert.equal(total, 5);
  assert.equal(page, 2);
  assert.equal(pageSize, 2);
});

test('getAdminOrders clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '0' }] };
    assert.deepEqual(params.slice(2), [100, 0]); // pageSize clamped 999 -> 100, page clamped 0 -> 1 -> offset 0
    return { rows: [] };
  });

  const { page, pageSize } = await adminOrderService.getAdminOrders({ page: 0, pageSize: 999 });
  assert.equal(page, 1);
  assert.equal(pageSize, 100);
});

test('getAdminOrders is not cached - two identical calls query the database four times (count + select, twice)', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) =>
    (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] })
  );

  await adminOrderService.getAdminOrders();
  await adminOrderService.getAdminOrders();

  assert.equal(query.mock.callCount(), 4);
});

test('updateOrderStatus rejects a status outside the five real values', async (t) => {
  await assert.rejects(adminOrderService.updateOrderStatus('ORD-1001', 'pending'));
});

test('updateOrderStatus runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET status = \$1 WHERE order_number = \$2/);
    assert.deepEqual(params, ['shipped', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
  });

  const order = await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');
  assert.equal(order.status, 'shipped');
});

test('updateOrderStatus returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderStatus('NOPE', 'shipped');
  assert.equal(order, null);
});

test('updateOrderStatus invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'processing' });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped' }],
  }));

  await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');

  assert.equal(orderCache.has('order:ORD-1001'), false);
});

test('updateOrderStatus also invalidates that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'processing' });
  orderCache.set('list:jane.doe@example.com:20:', { orders: [{ order_number: 'ORD-1001', status: 'processing' }], nextCursor: null });
  orderCache.set('list:someone.else@example.com:20:', { orders: [], nextCursor: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped', customer_email: 'jane.doe@example.com' }],
  }));

  await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');

  assert.equal(orderCache.has('list:jane.doe@example.com:20:'), false);
  assert.equal(orderCache.has('list:someone.else@example.com:20:'), true);
});

test('updateOrderShipping runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET carrier = \$1, tracking_number = \$2 WHERE order_number = \$3/);
    assert.deepEqual(params, ['UPS', '1Z999AA10123456784', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }] };
  });

  const order = await adminOrderService.updateOrderShipping('ORD-1001', {
    carrier: 'UPS',
    trackingNumber: '1Z999AA10123456784',
  });
  assert.equal(order.carrier, 'UPS');
});

test('updateOrderShipping returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderShipping('NOPE', { carrier: 'UPS', trackingNumber: '123' });
  assert.equal(order, null);
});

test('updateOrderShipping invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', carrier: null, tracking_number: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }],
  }));

  await adminOrderService.updateOrderShipping('ORD-1001', { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });

  assert.equal(orderCache.has('order:ORD-1001'), false);
});

test('updateOrderShipping also invalidates that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('list:jane.doe@example.com:20:', { orders: [{ order_number: 'ORD-1001', carrier: null }], nextCursor: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999', customer_email: 'jane.doe@example.com' }],
  }));

  await adminOrderService.updateOrderShipping('ORD-1001', { carrier: 'UPS', trackingNumber: '1Z999' });

  assert.equal(orderCache.has('list:jane.doe@example.com:20:'), false);
});

const EXISTING_ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  status: 'delivered',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
  refunded_at: null,
};

test('refundOrder returns null for an unknown order number', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const result = await adminOrderService.refundOrder('NOPE', { amountCents: 100, restock: false, reason: null });
  assert.equal(result, null);
});

test('refundOrder rejects a second refund on an already-refunded order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ ...EXISTING_ORDER, refunded_at: '2026-01-01T00:00:00Z' }],
  }));

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 100, restock: false, reason: null }),
    adminOrderService.ConflictError
  );
});

test('refundOrder rejects an amount that exceeds the order total', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [] };
  });

  // total = 5000 + 500 + 0 - 0 = 5500
  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5501, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder rejects a non-positive amount', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [] };
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 0, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder restocks when the product name still matches a live row', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    if (/^UPDATE products/.test(sql.trim())) {
      assert.match(sql, /stock_quantity = stock_quantity \+ 1/);
      assert.deepEqual(params, ['Sneakers']);
      return { rows: [{ slug: 'sneakers' }] };
    }
    if (/^UPDATE orders/.test(sql.trim())) {
      assert.match(sql, /status = 'returned'/);
      return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 5500, restocked: true, refunded_at: '2026-01-02T00:00:00Z' }] };
    }
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: 'Item damaged' });
  assert.equal(updated.status, 'returned');
  assert.equal(updated.restocked, true);
  assert.equal(query.mock.callCount(), 3);
});

test('refundOrder reports restocked:false without erroring when the product name matches nothing', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    if (/^UPDATE products/.test(sql.trim())) return { rows: [] }; // no matching product - renamed/deleted
    if (/^UPDATE orders/.test(sql.trim())) {
      return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 5500, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
    }
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });
  assert.equal(updated.restocked, false);
});

test('refundOrder does not attempt to restock when restock is false', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    assert.doesNotMatch(sql, /UPDATE products/);
    return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 2000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
  });

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });
  assert.equal(query.mock.callCount(), 2); // SELECT + the orders UPDATE only, no products UPDATE
});

test('refundOrder invalidates the order cache and that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'delivered' });
  orderCache.set('list:jane@example.com:20:', { orders: [], nextCursor: null });
  orderCache.set('list:someone.else@example.com:20:', { orders: [], nextCursor: null });

  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    return { rows: [{ ...EXISTING_ORDER, status: 'returned', customer_email: 'jane@example.com', refund_amount_cents: 2000, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
  });

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });

  assert.equal(orderCache.has('order:ORD-1001'), false);
  assert.equal(orderCache.has('list:jane@example.com:20:'), false);
  assert.equal(orderCache.has('list:someone.else@example.com:20:'), true);
});

test('refundOrder guards the UPDATE with refunded_at IS NULL to prevent concurrent refunds', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    // Verify the UPDATE includes the guard
    assert.match(sql, /AND refunded_at IS NULL/);
    return { rows: [{ ...EXISTING_ORDER, status: 'returned', refund_amount_cents: 5500, restocked: false, refunded_at: '2026-01-02T00:00:00Z' }] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: false, reason: null });
  assert.equal(updated.status, 'returned');
});

test('refundOrder throws ConflictError when the guarded UPDATE matches 0 rows (concurrent refund)', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/^SELECT \* FROM orders/.test(sql.trim())) return { rows: [EXISTING_ORDER] };
    // Guarded UPDATE found no matching rows: the order existed per SELECT,
    // but refunded_at is no longer NULL (concurrent refund happened between
    // SELECT and UPDATE).
    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [] };
    return { rows: [] };
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: false, reason: null }),
    adminOrderService.ConflictError
  );
});
