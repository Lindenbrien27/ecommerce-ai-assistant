const { Router } = require('express');
const { validate } = require('../controllers/promoCodeController');

const router = Router();

router.post('/validate', validate);

module.exports = router;
