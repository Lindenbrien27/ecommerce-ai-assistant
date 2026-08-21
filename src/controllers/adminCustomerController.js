
const adminCustomerService = require('../services/adminCustomerService');
const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');

function parseIntParam(raw, fallback) {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : NaN;
}

async function listCustomers(req, res) {
  const limit = parseIntParam(req.query.limit, adminCustomerService.DEFAULT_PAGE_SIZE);
  const page = parseIntParam(req.query.page, 1);
  if (Number.isNaN(limit) || Number.isNaN(page)) {
    return res.status(400).json({ error: 'limit and page must be integers.' });
  }

  try {
    const { customers, hasMore } = await adminCustomerService.getCustomers({
      q: req.query.q || null,
      page,
      limit,
    });
    res.json({ customers, hasMore });
  } catch (err) {
    logError('Admin customer list error', err);
    res.status(500).json({ error: 'Something went wrong looking up customers.' });
  }
}

async function getCustomer(req, res) {
  const limit = parseIntParam(req.query.limit, undefined);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  try {
    const summary = await adminCustomerService.getCustomerSummary(req.params.email);
    if (!summary) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const { orders, nextCursor } = await orderService.getOrdersByEmail(req.params.email, {
      limit,
      cursor: req.query.cursor,
    });
    res.json({
      email: summary.customer_email,
      orderCount: summary.order_count,
      totalSpentCents: summary.total_spent_cents,
      lastOrderAt: summary.last_order_at,
      orders,
      nextCursor,
    });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin customer detail error', err);
    res.status(500).json({ error: 'Something went wrong looking up that customer.' });
  }
}

async function getCustomerOrders(req, res) {
  const limit = parseIntParam(req.query.limit, undefined);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  try {
    const { orders, nextCursor } = await orderService.getOrdersByEmail(req.params.email, {
      limit,
      cursor: req.query.cursor,
    });
    res.json({ orders, nextCursor });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin customer orders error', err);
    res.status(500).json({ error: "Something went wrong looking up that customer's orders." });
  }
}

module.exports = { listCustomers, getCustomer, getCustomerOrders };
