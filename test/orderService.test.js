const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const orderService = require('../src/services/orderService');

test('getOrderByNumber returns the matching row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE order_number = \$1/);
    assert.deepEqual(params, ['ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
  });

  const order = await orderService.getOrderByNumber('ORD-1001');
  assert.equal(order.status, 'shipped');
});

test('getOrderByNumber returns null when nothing matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await orderService.getOrderByNumber('NOPE');
  assert.equal(order, null);
});

test('getOrdersByEmail returns every row for a customer', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE customer_email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return { rows: [{ order_number: 'ORD-1001' }, { order_number: 'ORD-1002' }] };
  });

  const orders = await orderService.getOrdersByEmail('jane.doe@example.com');
  assert.equal(orders.length, 2);
});

test('getOrderByTrackingNumber returns null when nothing matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await orderService.getOrderByTrackingNumber('BOGUS');
  assert.equal(order, null);
});
