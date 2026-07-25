const { Router } = require('express');
const { verify } = require('../controllers/authController');

const router = Router();

router.post('/verify', verify);

module.exports = router;
