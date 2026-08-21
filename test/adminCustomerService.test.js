
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminCustomerService = require('../src/services/adminCustomerService');

test('getCustomers groups orders by customer_email with aggregate stats, converting string aggregates to numbers', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /GROUP BY customer_email/);
    assert.equal(params[0], null);
    return {
      rows: [
        {
          customer_email: 'jane.doe@example.com',
          order_count: '3',
          total_spent_cents: '15000',
          last_order_at: '2026-07-24T00:00:00Z',
        },
      ],
    };
  });

  const { customers, hasMore } = await adminCustomerService.getCustomers();
  assert.equal(customers.length, 1);
  assert.equal(customers[0].order_count, 3);
  assert.equal(typeof customers[0].order_count, 'number');
  assert.equal(customers[0].total_spent_cents, 15000);
  assert.equal(typeof customers[0].total_spent_cents, 'number');
  assert.equal(hasMore, false);
});

test('getCustomers filters by q using ILIKE', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /customer_email ILIKE \$1/);
    assert.equal(params[0], '%jane%');
    return { rows: [] };
  });

  await adminCustomerService.getCustomers({ q: 'jane' });
});

test('getCustomers reports hasMore when more rows remain beyond the page size', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[1], 3);
    return {
      rows: [
        { customer_email: 'a@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-24T00:00:00Z' },
        { customer_email: 'b@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-23T00:00:00Z' },
        { customer_email: 'c@example.com', order_count: '1', total_spent_cents: '1000', last_order_at: '2026-07-22T00:00:00Z' },
      ],
    };
  });

  const { customers, hasMore } = await adminCustomerService.getCustomers({ limit: 2 });
  assert.equal(customers.length, 2);
  assert.equal(hasMore, true);
});

test('getCustomers computes the correct OFFSET for page 2', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.equal(params[2], 20);
    return { rows: [] };
  });

  await adminCustomerService.getCustomers({ page: 2 });
});

test('getCustomerSummary returns aggregate stats for one customer, converting string aggregates to numbers', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /WHERE customer_email = \$1/);
    assert.deepEqual(params, ['jane.doe@example.com']);
    return {
      rows: [
        {
          customer_email: 'jane.doe@example.com',
          order_count: '5',
          total_spent_cents: '145000',
          last_order_at: '2026-07-24T00:00:00Z',
        },
      ],
    };
  });

  const summary = await adminCustomerService.getCustomerSummary('jane.doe@example.com');
  assert.equal(summary.order_count, 5);
  assert.equal(typeof summary.order_count, 'number');
  assert.equal(summary.total_spent_cents, 145000);
});

test('getCustomerSummary returns null for an email with no orders', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const summary = await adminCustomerService.getCustomerSummary('nobody@example.com');
  assert.equal(summary, null);
});

test('getCustomers excludes cancelled orders from total_spent_cents in the SQL', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /FILTER \(WHERE status <> 'cancelled'\)/);
    return { rows: [] };
  });

  await adminCustomerService.getCustomers();
});

test('getCustomerSummary excludes cancelled orders from total_spent_cents in the SQL', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /FILTER \(WHERE status <> 'cancelled'\)/);
    return { rows: [] };
  });

  await adminCustomerService.getCustomerSummary('jane.doe@example.com');
});
