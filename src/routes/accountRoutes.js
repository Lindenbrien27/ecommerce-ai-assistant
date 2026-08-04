const { Router } = require('express');
const {
  getProfile,
  updateProfile,
  getAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} = require('../controllers/accountController');

const router = Router();

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.get('/address', getAddress);
router.put('/address', updateAddress);
router.delete('/address', deleteAddress);

router.get('/payment-method', getPaymentMethod);
router.put('/payment-method', updatePaymentMethod);
router.delete('/payment-method', deletePaymentMethod);

module.exports = router;
