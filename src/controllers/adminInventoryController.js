const adminInventoryService = require('../services/adminInventoryService');
const { logError } = require('../utils/logger');

function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function parsePagination(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    res.status(400).json({ error: 'page must be a positive integer.' });
    return null;
  }
  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    res.status(400).json({ error: 'pageSize must be a positive integer.' });
    return null;
  }
  return { page, pageSize };
}

async function listStockLedger(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const location = parsePositiveInt(req.query.location);
  if (Number.isNaN(location)) {
    res.status(400).json({ error: 'location must be a positive integer.' });
    return;
  }
  const supplier = parsePositiveInt(req.query.supplier);
  if (Number.isNaN(supplier)) {
    res.status(400).json({ error: 'supplier must be a positive integer.' });
    return;
  }
  try {
    const result = await adminInventoryService.getStockLedger({
      q: req.query.q || null,
      category: req.query.category || null,
      location: location ?? null,
      supplier: supplier ?? null,
      status: req.query.status || null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin inventory stock ledger error', err);
    res.status(500).json({ error: 'Something went wrong looking up inventory.' });
  }
}

async function listReorderQueue(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  const supplier = parsePositiveInt(req.query.supplier);
  if (Number.isNaN(supplier)) {
    res.status(400).json({ error: 'supplier must be a positive integer.' });
    return;
  }
  try {
    const result = await adminInventoryService.getReorderQueue({
      q: req.query.q || null,
      urgency: req.query.urgency || null,
      supplier: supplier ?? null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin inventory reorder queue error', err);
    res.status(500).json({ error: 'Something went wrong looking up the reorder queue.' });
  }
}

async function listPurchaseOrders(req, res) {
  const pagination = parsePagination(req, res);
  if (!pagination) return;
  try {
    const result = await adminInventoryService.getPurchaseOrders({
      q: req.query.q || null,
      status: req.query.status || null,
      ...pagination,
    });
    res.json(result);
  } catch (err) {
    logError('Admin purchase orders error', err);
    res.status(500).json({ error: 'Something went wrong looking up purchase orders.' });
  }
}

module.exports = { listStockLedger, listReorderQueue, listPurchaseOrders };
