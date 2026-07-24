const orderService = require('../services/orderService');

async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    console.error('Order lookup error:', err);
    res.status(500).json({ error: 'Something went wrong looking up that order.' });
  }
}

module.exports = { getOrder };
