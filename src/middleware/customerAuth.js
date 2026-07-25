const { verifyToken } = require('../services/authService');
const { auditLog } = require('../config/auditLog');

function requireCustomerAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    auditLog('auth.token_rejected', { reason: 'missing', path: req.originalUrl, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = verifyToken(token);
    req.customerEmail = payload.email;
    next();
  } catch (err) {
    auditLog('auth.token_rejected', {
      reason: err.name === 'TokenExpiredError' ? 'expired' : 'invalid',
      path: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireCustomerAuth };
