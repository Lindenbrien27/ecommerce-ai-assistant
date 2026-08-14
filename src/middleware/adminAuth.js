const { verifyAdminToken } = require('../services/adminAuthService');
const { auditLog } = require('../config/auditLog');

// Reads the httpOnly cookie (see adminAuthController.js), not an
// Authorization header - unlike requireCustomerAuth, the admin token is
// never exposed to frontend JS at all, so there's nothing for a client to
// put in a header.
function requireAdminAuth(req, res, next) {
  const token = req.cookies && req.cookies.adminToken;

  if (!token) {
    auditLog('admin.auth.token_rejected', { reason: 'missing', path: req.originalUrl, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifyAdminToken(token);
    req.adminId = payload.adminId;
    req.adminEmail = payload.email;
    next();
  } catch (err) {
    auditLog('admin.auth.token_rejected', {
      reason: err.name === 'TokenExpiredError' ? 'expired' : 'invalid',
      path: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireAdminAuth };
