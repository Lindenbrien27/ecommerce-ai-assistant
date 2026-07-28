const { Router } = require('express');
const { requestOtpHandler, verifyOtpHandler } = require('../controllers/authController');

const router = Router();

router.post('/otp/request', requestOtpHandler);
router.post('/otp/verify', verifyOtpHandler);

module.exports = router;
