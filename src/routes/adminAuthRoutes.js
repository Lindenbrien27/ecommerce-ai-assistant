const { Router } = require('express');
const { googleLoginHandler, meHandler, logoutHandler } = require('../controllers/adminAuthController');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { adminLoginLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Scoped to just this route, not the whole router - GET /me is polled on
// every page load by AdminAuthContext, and counting that against the same
// tiny login-attempt budget as POST /google exhausted it after ~4 reloads.
// /me and /logout both already require a valid signed cookie, so they don't
// need a rate limit of their own on top of that.
router.post('/google', adminLoginLimiter, googleLoginHandler);
router.get('/me', requireAdminAuth, meHandler);
router.post('/logout', requireAdminAuth, logoutHandler);

module.exports = router;
