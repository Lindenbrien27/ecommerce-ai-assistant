const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminDashboardService = require('../src/services/adminDashboardService');

test('getDashboardStats computes total revenue, order count, and AOV, excluding cancelled orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /status <> 'cancelled'/);
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '2', total_revenue_cents: '30000' }] };
  });

  const stats = await adminDashboardService.getDashboardStats();
  assert.equal(stats.total_orders, 2);
  assert.equal(typeof stats.total_orders, 'number');
  assert.equal(stats.total_revenue_cents, 30000);
  assert.equal(typeof stats.total_revenue_cents, 'number');
  assert.equal(stats.average_order_value_cents, 15000);
});

test('getDashboardStats returns 0 average order value (not NaN) when there are no orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '0', total_revenue_cents: null }] };
  });

  const stats = await adminDashboardService.getDashboardStats();
  assert.equal(stats.total_orders, 0);
  assert.equal(stats.total_revenue_cents, 0);
  assert.equal(stats.average_order_value_cents, 0);
});

test('getDashboardStats ranks top_products by revenue descending, capped at 5, tiebroken by product_name', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) {
      assert.match(sql, /ORDER BY revenue_cents DESC, product_name ASC/);
      assert.match(sql, /LIMIT 5/);
      return {
        rows: [
          { product_name: '27" 4K Monitor', product_icon: 'monitor', revenue_cents: '189746', units_sold: '3' },
          { product_name: 'Ergonomic Office Chair', product_icon: 'chair', revenue_cents: '74997', units_sold: '3' },
        ],
      };
    }
    return { rows: [{ total_orders: '10', total_revenue_cents: '500000' }] };
  });

  const { top_products } = await adminDashboardService.getDashboardStats();
  assert.equal(top_products.length, 2);
  assert.equal(top_products[0].product_name, '27" 4K Monitor');
  assert.equal(top_products[0].revenue_cents, 189746);
  assert.equal(typeof top_products[0].revenue_cents, 'number');
  assert.equal(top_products[0].units_sold, 3);
  assert.equal(typeof top_products[0].units_sold, 'number');
  assert.equal(top_products[0].product_icon, 'monitor');
});

test('getDashboardStats returns an empty top_products list when there are no orders', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/GROUP BY product_name/.test(sql)) return { rows: [] };
    return { rows: [{ total_orders: '0', total_revenue_cents: null }] };
  });

  const { top_products } = await adminDashboardService.getDashboardStats();
  assert.deepEqual(top_products, []);
});
