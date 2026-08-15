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
