const adminOrderService = require('../services/adminOrderService');
const orderService = require('../services/orderService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

async function listOrders(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    return res.status(400).json({ error: 'page must be a positive integer.' });
  }

  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    return res.status(400).json({ error: 'pageSize must be a positive integer.' });
  }

  const status = req.query.status || null;
  if (status && !adminOrderService.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${adminOrderService.ORDER_STATUSES.join(', ')}` });
  }

  try {
    const result = await adminOrderService.getAdminOrders({
      status,
      q: req.query.q || null,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
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

async function refundOrder(req, res) {
  const { amount_cents: amountCents, restock, reason } = req.body;
  try {
    const updated = await adminOrderService.refundOrder(req.params.orderNumber, {
      amountCents,
      restock: Boolean(restock),
      reason: reason || null,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }
    auditLog('admin.order.refunded', {
      orderNumber: req.params.orderNumber,
      amountCents,
      restock: Boolean(restock),
      admin: req.adminEmail,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof adminOrderService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminOrderService.ConflictError) {
      return res.status(409).json({ error: err.message });
    }
    logError('Admin order refund error', err);
    res.status(500).json({ error: 'Something went wrong processing that refund.' });
  }
}

module.exports = { listOrders, getOrder, updateStatus, getInvoicePdf, getPackingSlipPdf, updateShipping, refundOrder };
