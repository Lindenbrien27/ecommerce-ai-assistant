const rateLimit = require('express-rate-limit');

const chatLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again shortly.' },
});

const ordersLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ORDERS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_ORDERS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order lookups, please try again shortly.' },
});

// Stricter: this endpoint lets someone try guessing (order number, email)
// pairs, so it gets a tighter default than the read endpoints above.
const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts, please try again shortly.' },
});

module.exports = { chatLimiter, ordersLimiter, authLimiter };
