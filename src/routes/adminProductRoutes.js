const { Router } = require('express');
const { createProduct, updateProduct, deleteProduct, listProducts, uploadProductImage } = require('../controllers/adminProductController');
const { productImageUpload } = require('../middleware/upload');

const router = Router();

router.get('/', listProducts);
router.post('/', createProduct);
router.patch('/:slug', updateProduct);
router.delete('/:slug', deleteProduct);

router.post('/uploads', (req, res, next) => {
  productImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, uploadProductImage);

module.exports = router;
