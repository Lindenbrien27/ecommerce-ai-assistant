const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const adminOrderService = require('../src/services/adminOrderService');

test.beforeEach(() => orderCache.clear());

test('getAdminOrders queries across all customers with no email filter', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.doesNotMatch(sql, /customer_email = \$/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return { rows: [{ order_number: 'ORD-1001' }] };
  });

  const { orders, nextCursor } = await adminOrderService.getAdminOrders();
  assert.equal(orders.length, 1);
  assert.equal(nextCursor, null);
});

test('getAdminOrders filters by status when provided', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /status = \$1/);
    assert.equal(params[0], 'shipped');
    return { rows: [] };
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
    return { rows: [] };
  });

  await adminOrderService.getAdminOrders({ q: 'ORD-1001' });
});

test('getAdminOrders paginates with a nextCursor when more rows remain', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [
      { order_number: 'ORD-1003', created_at: '2026-01-03T00:00:00Z', id: 3 },
      { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
      { order_number: 'ORD-1001', created_at: '2026-01-01T00:00:00Z', id: 1 },
    ],
  }));

  const { orders, nextCursor } = await adminOrderService.getAdminOrders({ limit: 2 });
  assert.equal(orders.length, 2);
  assert.ok(typeof nextCursor === 'string' && nextCursor.length > 0);
});

test('getAdminOrders rejects a malformed cursor', async (t) => {
  await assert.rejects(
    adminOrderService.getAdminOrders({ cursor: 'not-json' }),
    adminOrderService.InvalidCursorError
  );
});

test('getAdminOrders is not cached - two identical calls query twice', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await adminOrderService.getAdminOrders();
  await adminOrderService.getAdminOrders();

  assert.equal(query.mock.callCount(), 2);
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
