const { Router } = require('express');
const {
  listOrders,
  getOrder,
  updateStatus,
  getInvoicePdf,
  getPackingSlipPdf,
  updateShipping,
  refundOrder,
} = require('../controllers/adminOrderController');

const router = Router();

router.get('/', listOrders);
router.get('/:orderNumber', getOrder);
router.patch('/:orderNumber/status', updateStatus);
router.get('/:orderNumber/invoice.pdf', getInvoicePdf);
router.get('/:orderNumber/packing-slip.pdf', getPackingSlipPdf);
router.patch('/:orderNumber/shipping', updateShipping);
router.post('/:orderNumber/refund', refundOrder);

module.exports = router;
