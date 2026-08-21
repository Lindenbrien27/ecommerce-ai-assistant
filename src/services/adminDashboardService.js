const { pool } = require('../config/db');

async function getDashboardStats() {
  const statsResult = await pool.query(
    `SELECT COUNT(*) AS total_orders,
            SUM(COALESCE(unit_price_cents,0) + COALESCE(delivery_cost_cents,0) + COALESCE(vat_cents,0) - COALESCE(voucher_cents,0)) AS total_revenue_cents
     FROM orders
     WHERE status <> 'cancelled'`
  );
  const totalOrders = Number(statsResult.rows[0].total_orders);

  const totalRevenueCents = Number(statsResult.rows[0].total_revenue_cents);
  const averageOrderValueCents = totalOrders === 0 ? 0 : Math.round(totalRevenueCents / totalOrders);

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
