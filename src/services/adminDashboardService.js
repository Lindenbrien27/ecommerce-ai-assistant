const { pool } = require('../config/db');

// Excludes cancelled orders - they never generated real revenue. Same
// convention adminCustomerService.js's TOTAL_SPENT_SQL already
// established for per-customer totals, applied here at the whole-table
// level.
async function getDashboardStats() {
  const statsResult = await pool.query(
    `SELECT COUNT(*) AS total_orders,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_revenue_cents
     FROM orders
     WHERE status <> 'cancelled'`
  );
  const totalOrders = Number(statsResult.rows[0].total_orders);
  // SUM() over zero matching rows returns SQL NULL, not 0 - Number(null)
  // is 0 in JS, so this already comes out correct without an explicit
  // fallback.
  const totalRevenueCents = Number(statsResult.rows[0].total_revenue_cents);
  const averageOrderValueCents = totalOrders === 0 ? 0 : Math.round(totalRevenueCents / totalOrders);

  // orders has no product_id (see this plan's own Global Constraints) -
  // "top products" is grouped by the free-text product_name snapshot
  // captured at purchase time, not joined to the products table.
  // product_icon is wrapped in MAX() because it's non-aggregated but
  // stable per product_name in this app's data - a mechanical way to
  // carry a single-valued column through GROUP BY without adding it to
  // the grouping key.
  // COUNT(*) doubles as units_sold because orders has no quantity column -
  // one row is one unit today. If a quantity column is ever added, this
  // needs to become SUM(quantity) instead.
  const topProductsResult = await pool.query(
    `SELECT product_name,
            MAX(product_icon) AS product_icon,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS revenue_cents,
            COUNT(*) AS units_sold
     FROM orders
     WHERE status <> 'cancelled'
     GROUP BY product_name
     ORDER BY revenue_cents DESC, product_name ASC
     LIMIT 5`
  );
  const topProducts = topProductsResult.rows.map((row) => ({
    product_name: row.product_name,
    product_icon: row.product_icon,
    revenue_cents: Number(row.revenue_cents),
    units_sold: Number(row.units_sold),
  }));

  return {
    total_revenue_cents: totalRevenueCents,
    total_orders: totalOrders,
    average_order_value_cents: averageOrderValueCents,
    top_products: topProducts,
  };
}

module.exports = { getDashboardStats };
