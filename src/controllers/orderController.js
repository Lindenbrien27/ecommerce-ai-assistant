const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.id);
    const isOwned = order && order.customer_email.toLowerCase() === req.customerEmail.toLowerCase();

    if (!isOwned) {
      auditLog('order.access_denied', {
        reason: order ? 'not_owned' : 'not_found',
        orderNumber: req.params.id,
        requestedBy: req.customerEmail,
        ...(order ? { actualOwner: order.customer_email } : {}),
        ip: req.ip,
      });
      return res.status(404).json({ error: 'Order not found' });
    }

    res.setHeader('Cache-Control', 'private, max-age=30');

    res.json(orderService.toCustomerOrder(order));
  } catch (err) {
    logError('Order lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

function parseLimit(rawLimit) {
  if (rawLimit === undefined) return undefined;
  const limit = Number(rawLimit);
  return Number.isInteger(limit) ? limit : NaN;
}

async function listMyOrders(req, res) {
  const limit = parseLimit(req.query.limit);
  if (Number.isNaN(limit)) {
    return res.status(400).json({ error: 'limit must be an integer.' });
  }

  try {
    const { orders, nextCursor } = await orderService.getOrdersByEmail(req.customerEmail, {
      limit,
      cursor: req.query.cursor,
    });
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ orders: orders.map(orderService.toCustomerOrder), nextCursor });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Order list error', err);
    res.status(500).json({ error: 'Something went wrong looking up your orders.' });
  }
}

module.exports = { getOrder, listMyOrders };
