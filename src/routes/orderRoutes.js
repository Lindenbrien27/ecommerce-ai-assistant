const { Router } = require('express');
const { getOrder } = require('../controllers/orderController');

const router = Router();

router.get('/:id', getOrder);

module.exports = router;
