const { Router } = require('express');
const { listOrders, getOrder, updateStatus } = require('../controllers/adminOrderController');

const router = Router();

router.get('/', listOrders);
router.get('/:orderNumber', getOrder);
router.patch('/:orderNumber/status', updateStatus);

module.exports = router;
