const jwt = require('jsonwebtoken');
const orderService = require('./orderService');

const TOKEN_TTL = '1h';

// A customer proves who they are with the order number + email on that
// order - the same low-friction pattern real package-tracking tools use
// (Shopify, UPS, FedEx). No password to store, no email-sending service
// needed. Returns the canonical stored email on success, null otherwise.
async function verifyCustomer(orderNumber, email) {
  if (!orderNumber || !email) return null;

  const order = await orderService.getOrderByNumber(orderNumber);
  if (!order) return null;

  if (order.customer_email.toLowerCase() !== String(email).toLowerCase()) {
    return null;
  }

  return order.customer_email;
}

function issueToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Throws if the token is missing, malformed, expired, or signed with a
// different secret - callers are expected to catch this.
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { verifyCustomer, issueToken, verifyToken };
