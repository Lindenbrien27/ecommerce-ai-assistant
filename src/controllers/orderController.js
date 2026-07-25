const orderService = require('../services/orderService');
const { logError } = require('../utils/logger');

async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    logError('Order lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

module.exports = { getOrder };
