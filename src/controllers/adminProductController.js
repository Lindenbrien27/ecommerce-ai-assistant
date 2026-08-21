const adminProductService = require('../services/adminProductService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const WRITABLE_FIELDS = [
  'slug',
  'name',
  'description',
  'category',
  'price_cents',
  'original_price_cents',
  'cover_image_url',
  'icon',
  'sku',
  'stock_quantity',
  'colorways',
  'specs',
];

function fieldsFromBody(body) {
  const fields = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
}

function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

async function listProducts(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) {
    return res.status(400).json({ error: 'page must be a positive integer.' });
  }

  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) {
    return res.status(400).json({ error: 'pageSize must be a positive integer.' });
  }

  try {
    const result = await adminProductService.getAdminProducts({
      q: req.query.q || null,
      category: req.query.category || null,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    logError('Admin product list error', err);
    res.status(500).json({ error: 'Something went wrong looking up products.' });
  }
}

async function createProduct(req, res) {
  try {
    const product = await adminProductService.createProduct(fieldsFromBody(req.body));
    auditLog('admin.product.created', { slug: product.slug, admin: req.adminEmail });
    res.status(201).json(product);
  } catch (err) {
    if (err instanceof adminProductService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminProductService.ConflictError) {
      return res.status(409).json({ error: `${err.field} already exists.` });
    }
    logError('Admin product create error', err);
    res.status(500).json({ error: 'Something went wrong creating that product.' });
  }
}

async function updateProduct(req, res) {
  try {
    const product = await adminProductService.updateProduct(req.params.slug, fieldsFromBody(req.body));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    auditLog('admin.product.updated', { slug: req.params.slug, admin: req.adminEmail });
    res.json(product);
  } catch (err) {
    if (err instanceof adminProductService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof adminProductService.ConflictError) {
      return res.status(409).json({ error: `${err.field} already exists.` });
    }
    logError('Admin product update error', err);
    res.status(500).json({ error: 'Something went wrong updating that product.' });
  }
}

async function deleteProduct(req, res) {
  try {
    const deleted = await adminProductService.deleteProduct(req.params.slug);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }
    auditLog('admin.product.deleted', { slug: req.params.slug, admin: req.adminEmail });
    res.json({ ok: true });
  } catch (err) {
    logError('Admin product delete error', err);
    res.status(500).json({ error: 'Something went wrong deleting that product.' });
  }
}

function uploadProductImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file was uploaded.' });
  }
  res.status(201).json({ url: `/uploads/products/${req.file.filename}` });
}

module.exports = { createProduct, updateProduct, deleteProduct, listProducts, uploadProductImage };
