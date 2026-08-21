
const PDFDocument = require('pdfkit');
const { formatCents, computeOrderTotal } = require('../utils/pricing');

function hasShippingAddress(order) {
  return Boolean(order.address_line1);
}

function addressLines(order) {
  const lines = [order.recipient_name, order.address_line1];
  if (order.address_line2) lines.push(order.address_line2);
  lines.push(`${order.city}, ${order.state || ''} ${order.postal_code}`.replace(/\s+/g, ' ').trim());
  lines.push(order.country);
  return lines.filter(Boolean);
}

function buildInvoiceFields(order) {
  if (!hasShippingAddress(order)) return null;
  const total = computeOrderTotal(order);
  if (total === null) return null;

  return {
    orderNumber: order.order_number,
    date: order.created_at,
    address: addressLines(order),
    productName: order.product_name,
    unitPrice: formatCents(order.unit_price_cents),
    delivery: order.delivery_cost_cents ? formatCents(order.delivery_cost_cents) : 'Free',
    vat: formatCents(order.vat_cents || 0),
    voucher: order.voucher_cents > 0 ? { code: order.voucher_code, amount: formatCents(order.voucher_cents) } : null,
    total: formatCents(total),
  };
}

function buildPackingSlipFields(order) {
  if (!hasShippingAddress(order)) return null;

  return {
    orderNumber: order.order_number,
    address: addressLines(order),
    productName: order.product_name,
    quantity: 1,
  };
}

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function buildInvoicePdf(order) {
  const fields = buildInvoiceFields(order);
  if (!fields) return null;

  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Invoice', { align: 'left' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Order: ${fields.orderNumber}`);
  doc.text(`Date: ${new Date(fields.date).toLocaleDateString('en-US')}`);
  doc.moveDown();
  doc.text('Ship to:');
  fields.address.forEach((line) => doc.text(line));
  doc.moveDown();
  doc.text(`Product: ${fields.productName}`);
  doc.moveDown();
  doc.text(`Unit price: ${fields.unitPrice}`);
  doc.text(`Delivery: ${fields.delivery}`);
  doc.text(`VAT: ${fields.vat}`);
  if (fields.voucher) {
    doc.text(`Voucher${fields.voucher.code ? ` (${fields.voucher.code})` : ''}: -${fields.voucher.amount}`);
  }
  doc.moveDown();
  doc.fontSize(13).text(`Total: ${fields.total}`, { underline: true });

  return streamToBuffer(doc);
}

async function buildPackingSlipPdf(order) {
  const fields = buildPackingSlipFields(order);
  if (!fields) return null;

  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Packing Slip', { align: 'left' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Order: ${fields.orderNumber}`);
  doc.moveDown();
  doc.text('Ship to:');
  fields.address.forEach((line) => doc.text(line));
  doc.moveDown();
  doc.text(`Product: ${fields.productName}`);
  doc.text(`Quantity: ${fields.quantity}`);

  return streamToBuffer(doc);
}

module.exports = { buildInvoiceFields, buildPackingSlipFields, buildInvoicePdf, buildPackingSlipPdf };
