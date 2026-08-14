const adminOrderService = require('../services/adminOrderService');
const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

function parseLimit(rawLimit) {
  if (rawLimit === undefined) return undefined;
  const limit = Number(rawLimit);
  return Number.isInteger(limit) ? limit : NaN;
}

async function listOrders(req, res) {
  const limit = parseLimit(req.query.limit);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  const status = req.query.status || null;
  if (status && !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const { orders, nextCursor } = await adminOrderService.getAdminOrders({
      status,
      q: req.query.q || null,
      limit,
      cursor: req.query.cursor,
    });
    res.json({ orders, nextCursor });
  } catch (err) {
    if (err instanceof adminOrderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Admin order list error', err);
    res.status(500).json({ error: 'Something went wrong looking up orders.' });
  }
}

// Reuses orderService.getOrderByNumber directly - identical lookup and
// cache handling as the customer path, just without the ownership check
// customer requests need (an admin isn't scoped to one customer's orders).
async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    logError('Admin order lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (!status || !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const previous = await orderService.getOrderByNumber(req.params.orderNumber);
    const updated = await adminOrderService.updateOrderStatus(req.params.orderNumber, status);
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }
    auditLog('admin.order.status_updated', {
      orderNumber: req.params.orderNumber,
      from: previous ? previous.status : null,
      to: status,
      admin: req.adminEmail,
    });
    res.json(updated);
  } catch (err) {
    logError('Admin order status update error', err);
    res.status(500).json({ error: 'Something went wrong updating that order.' });
  }
}

module.exports = { listOrders, getOrder, updateStatus };
