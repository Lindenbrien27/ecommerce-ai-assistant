const { verifyCustomer, issueToken } = require('../services/authService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

async function verify(req, res) {
  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'orderNumber and email are required' });
  }

  try {
    const canonicalEmail = await verifyCustomer(orderNumber, email);

    if (!canonicalEmail) {
      auditLog('auth.verify_failed', { orderNumber, email: String(email).toLowerCase(), ip: req.ip });
      return res
        .status(401)
        .json({ error: "We couldn't verify that order. Check your order number and email and try again." });
    }

    auditLog('auth.verify_succeeded', { email: canonicalEmail, ip: req.ip });
    const token = issueToken(canonicalEmail);
    res.json({ token });
  } catch (err) {
    logError('Auth verify error', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

module.exports = { verify };
