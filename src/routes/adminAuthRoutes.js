const { Router } = require('express');
const { googleLoginHandler, meHandler, logoutHandler } = require('../controllers/adminAuthController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = Router();

router.post('/google', googleLoginHandler);
router.get('/me', requireAdminAuth, meHandler);
router.post('/logout', requireAdminAuth, logoutHandler);

module.exports = router;
