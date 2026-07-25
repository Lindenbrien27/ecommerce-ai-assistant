const rateLimit = require('express-rate-limit');

const chatLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again shortly.' },
});

module.exports = { chatLimiter };
