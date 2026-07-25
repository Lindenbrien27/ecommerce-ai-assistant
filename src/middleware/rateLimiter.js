const rateLimit = require('express-rate-limit');
const { auditLog } = require('../config/auditLog');

// The default handler just sends optionsUsed.statusCode/message - this
// does the same, plus an audit log entry, so a client hammering an
// endpoint shows up as a distinct, filterable event rather than only as a
// string of 429s in the routine access log.
function auditedHandler(limiterName) {
  return (req, res, next, optionsUsed) => {
    auditLog('rate_limit.exceeded', { limiter: limiterName, path: req.originalUrl, ip: req.ip });
    res.status(optionsUsed.statusCode).json(optionsUsed.message);
  };
}

const chatLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again shortly.' },
  handler: auditedHandler('chat'),
});

const ordersLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ORDERS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_ORDERS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order lookups, please try again shortly.' },
  handler: auditedHandler('orders'),
});

// Stricter: this endpoint lets someone try guessing (order number, email)
// pairs, so it gets a tighter default than the read endpoints above.
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts, please try again shortly.' },
  handler: auditedHandler('auth'),
});

module.exports = { chatLimiter, ordersLimiter, authLimiter };
