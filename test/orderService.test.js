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

test('getOrdersByEmail returns a page of rows for a customer with no next cursor when a page isn\'t full', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE customer_email = \$1/);
    assert.equal(params[0], 'jane.doe@example.com');
    assert.equal(params[1], null); // no cursor on the first page
    assert.equal(params[3], 21); // default page size (20) + 1, to detect a next page
    return { rows: [{ order_number: 'ORD-1001' }, { order_number: 'ORD-1002' }] };
  });

  const { orders, nextCursor } = await orderService.getOrdersByEmail('jane.doe@example.com');
  assert.equal(orders.length, 2);
  assert.equal(nextCursor, null);
});

test('getOrdersByEmail returns a nextCursor when more rows remain beyond the page size', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[3], 3); // requested limit (2) + 1
    return {
      rows: [
        { order_number: 'ORD-1001', created_at: '2026-01-03T00:00:00Z', id: 3 },
        { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
        { order_number: 'ORD-1003', created_at: '2026-01-01T00:00:00Z', id: 1 },
      ],
    };
  });

  const { orders, nextCursor } = await orderService.getOrdersByEmail('jane.doe@example.com', { limit: 2 });
  assert.equal(orders.length, 2);
  assert.ok(typeof nextCursor === 'string' && nextCursor.length > 0);
});

test('getOrdersByEmail passes the decoded cursor as the keyset filter', async (t) => {
  const cursor = Buffer.from(
    JSON.stringify({ createdAt: '2026-01-02T00:00:00Z', id: 2 }),
    'utf8'
  ).toString('base64url');

  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[1], '2026-01-02T00:00:00Z');
    assert.equal(params[2], 2);
    return { rows: [] };
  });

  await orderService.getOrdersByEmail('jane.doe@example.com', { cursor });
});

test('getOrdersByEmail rejects a malformed cursor', async (t) => {
  await assert.rejects(
    orderService.getOrdersByEmail('jane.doe@example.com', { cursor: 'not-json' }),
    orderService.InvalidCursorError
  );
});

test('getOrdersByEmail clamps limit to the max page size', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[3], orderService.MAX_PAGE_SIZE + 1);
    return { rows: [] };
  });

  await orderService.getOrdersByEmail('jane.doe@example.com', { limit: 9999 });
});

test('getOrderByTrackingNumber returns null when nothing matches', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await orderService.getOrderByTrackingNumber('BOGUS');
  assert.equal(order, null);
});
