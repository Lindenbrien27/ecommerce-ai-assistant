const productService = require('../services/productService');
const { logError } = require('../utils/logger');

async function listProducts(req, res) {
  try {
    const products = await productService.getProducts();
    res.json({ products });
  } catch (err) {
    logError('Product list error', err);
    res.status(500).json({ error: 'Something went wrong looking up products.' });
  }
}

async function getProduct(req, res) {
  try {
    const product = await productService.getProductBySlug(req.params.slug);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    logError('Product lookup error', err);
    res.status(500).json({ error: 'Something went wrong looking up that product.' });
  }
}

module.exports = { listProducts, getProduct };
