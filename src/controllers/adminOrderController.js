const adminOrderService = require('../services/adminOrderService');
const orderService = require('../services/orderService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
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

async function getInvoicePdf(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const pdf = await pdfService.buildInvoicePdf(order);
    if (!pdf) {
      return res.status(409).json({ error: 'This order has no shipping address or pricing data on file yet.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logError('Admin invoice PDF error', err);
    res.status(500).json({ error: 'Something went wrong generating that invoice.' });
  }
}

async function getPackingSlipPdf(req, res) {
  try {
    const order = await orderService.getOrderByNumber(req.params.orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const pdf = await pdfService.buildPackingSlipPdf(order);
    if (!pdf) {
      return res.status(409).json({ error: 'This order has no shipping address on file yet.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="packing-slip-${order.order_number}.pdf"`);
    res.send(pdf);
  } catch (err) {
    logError('Admin packing slip PDF error', err);
    res.status(500).json({ error: 'Something went wrong generating that packing slip.' });
  }
}

async function updateShipping(req, res) {
  const { carrier, trackingNumber } = req.body;
  if (!carrier || !trackingNumber) {
    return res.status(400).json({ error: 'carrier and trackingNumber are required.' });
  }

  try {
    const previous = await orderService.getOrderByNumber(req.params.orderNumber);
    const updated = await adminOrderService.updateOrderShipping(req.params.orderNumber, { carrier, trackingNumber });
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // A no-op re-save (admin clicks Save without changing anything) must
    // not re-notify the customer.
    const changed = !previous || previous.carrier !== carrier || previous.tracking_number !== trackingNumber;
    let emailed = false;
    if (changed) {
      emailed = await emailService.sendShippingUpdateEmail(updated.customer_email, updated);
    }

    auditLog('admin.order.shipping_updated', {
      orderNumber: req.params.orderNumber,
      carrier,
      trackingNumber,
      emailed,
      admin: req.adminEmail,
    });
    res.json({ ...updated, emailed });
  } catch (err) {
    logError('Admin order shipping update error', err);
    res.status(500).json({ error: 'Something went wrong updating shipping info.' });
  }
}

module.exports = { listOrders, getOrder, updateStatus, getInvoicePdf, getPackingSlipPdf, updateShipping };
