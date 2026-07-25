const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');

async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.id);

    // 404 (not 403) whether the order doesn't exist or belongs to someone
    // else - same response either way so we don't leak that a given order
    // number exists but isn't the requester's.
    if (!order || order.customer_email.toLowerCase() !== req.customerEmail.toLowerCase()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    logError('Order lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

module.exports = { getOrder };
