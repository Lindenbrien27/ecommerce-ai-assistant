const { Router } = require('express');
const {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
} = require('../controllers/adminPromoCodeController');

const router = Router();

router.get('/', listPromoCodes);
router.post('/', createPromoCode);
router.patch('/:code', updatePromoCode);
router.delete('/:code', deletePromoCode);

module.exports = router;
