const { Router } = require('express');
const { createProduct, updateProduct, deleteProduct } = require('../controllers/adminProductController');

const router = Router();

router.post('/', createProduct);
router.patch('/:slug', updateProduct);
router.delete('/:slug', deleteProduct);

module.exports = router;
