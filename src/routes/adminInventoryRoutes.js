const { Router } = require('express');
const { listStockLedger, listReorderQueue, listPurchaseOrders } = require('../controllers/adminInventoryController');

const router = Router();

router.get('/', listStockLedger);
router.get('/reorder', listReorderQueue);
router.get('/purchase-orders', listPurchaseOrders);

module.exports = router;
