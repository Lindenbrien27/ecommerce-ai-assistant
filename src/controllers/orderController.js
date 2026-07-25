const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.id);
    const isOwned = order && order.customer_email.toLowerCase() === req.customerEmail.toLowerCase();

    // 404 (not 403) whether the order doesn't exist or belongs to someone
    // else - same response either way so we don't leak that a given order
    // number exists but isn't the requester's. The audit log still tells
    // the two apart internally: an authenticated customer's token hitting
    // an order that genuinely belongs to someone else is a materially
    // different signal (possible token leakage/reuse, or enumeration)
    // than one that just doesn't exist, even though neither should be
    // visible to the requester.
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

    res.json(order);
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
    res.json({ orders, nextCursor });
  } catch (err) {
    if (err instanceof orderService.InvalidCursorError) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    logError('Order list error', err);
    res.status(500).json({ error: 'Something went wrong looking up your orders.' });
  }
}

module.exports = { getOrder, listMyOrders };
