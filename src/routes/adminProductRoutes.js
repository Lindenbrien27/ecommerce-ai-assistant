const { Router } = require('express');
const { createProduct, updateProduct, deleteProduct, listProducts } = require('../controllers/adminProductController');

const router = Router();

router.get('/', listProducts);
router.post('/', createProduct);
router.patch('/:slug', updateProduct);
router.delete('/:slug', deleteProduct);

module.exports = router;
