const { pool } = require('../config/db');

async function getOrderByNumber(orderNumber) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  return rows[0] ?? null;
}

async function getOrdersByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE customer_email = $1 ORDER BY created_at DESC',
    [email]
  );
  return rows;
}

async function getOrderByTrackingNumber(trackingNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE tracking_number = $1',
    [trackingNumber]
  );
  return rows[0] ?? null;
}

module.exports = {
  getOrderByNumber,
  getOrdersByEmail,
  getOrderByTrackingNumber,
};
