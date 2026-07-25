const { Router } = require('express');
const { getOrder, listMyOrders } = require('../controllers/orderController');

const router = Router();

router.get('/', listMyOrders);
router.get('/:id', getOrder);

module.exports = router;
