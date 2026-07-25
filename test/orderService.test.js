const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const orderService = require('../src/services/orderService');

// A clean cache before every test - several tests below mock the same
// order number/email with different pool.query results, and a cache hit
// from an earlier test would otherwise serve stale data instead of calling
// the newly-mocked pool.query.
test.beforeEach(() => orderCache.clear());

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

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

test('getOrdersByEmail rejects a well-typed cursor with a createdAt that is not a real date', async (t) => {
  // Found in a security review: this used to reach the query and fail
  // there instead (an invalid ::timestamptz literal), which the controller
  // reports as a 500 - a malformed client cursor should 400, not look like
  // a server fault.
  const cursor = encodeCursor({ createdAt: 'not-a-real-date', id: 5 });
  await assert.rejects(
    orderService.getOrdersByEmail('jane.doe@example.com', { cursor }),
    orderService.InvalidCursorError
  );
});

test('getOrdersByEmail rejects a well-typed cursor with a non-integer id', async (t) => {
  const cursor = encodeCursor({ createdAt: '2026-01-01T00:00:00Z', id: 1.5 });
  await assert.rejects(
    orderService.getOrdersByEmail('jane.doe@example.com', { cursor }),
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

test('getOrderByNumber serves a second lookup from cache without querying again', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped' }],
  }));

  const first = await orderService.getOrderByNumber('ORD-1001');
  const second = await orderService.getOrderByNumber('ORD-1001');

  assert.equal(query.mock.callCount(), 1);
  assert.deepEqual(second, first);
});

test('getOrderByNumber caches a not-found result too - repeated probing of a bogus order number costs one query, not one per attempt', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await orderService.getOrderByNumber('NOPE');
  await orderService.getOrderByNumber('NOPE');
  await orderService.getOrderByNumber('NOPE');

  assert.equal(query.mock.callCount(), 1);
});

test('getOrderByNumber does not cache across different order numbers', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, [orderNumber]) => ({
    rows: [{ order_number: orderNumber, status: 'shipped' }],
  }));

  await orderService.getOrderByNumber('ORD-1001');
  await orderService.getOrderByNumber('ORD-1002');

  assert.equal(query.mock.callCount(), 2);
});

test('getOrdersByEmail serves a second identical page request from cache', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001' }],
  }));

  await orderService.getOrdersByEmail('jane.doe@example.com', { limit: 20 });
  await orderService.getOrdersByEmail('jane.doe@example.com', { limit: 20 });

  assert.equal(query.mock.callCount(), 1);
});

test('getOrdersByEmail treats different customers as different cache entries', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql, [email]) => ({
    rows: [{ order_number: 'ORD-1001', customer_email: email }],
  }));

  await orderService.getOrdersByEmail('jane.doe@example.com', { limit: 20 });
  await orderService.getOrdersByEmail('john.smith@example.com', { limit: 20 });

  assert.equal(query.mock.callCount(), 2);
});

test('getOrderByTrackingNumber serves a second lookup from cache without querying again', async (t) => {
  const query = t.mock.method(pool, 'query', async () => ({
    rows: [{ tracking_number: '1Z999AA10123456784' }],
  }));

  await orderService.getOrderByTrackingNumber('1Z999AA10123456784');
  await orderService.getOrderByTrackingNumber('1Z999AA10123456784');

  assert.equal(query.mock.callCount(), 1);
});
