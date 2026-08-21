const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { auditLog } = require('../config/auditLog');

function auditedHandler(limiterName) {
  return (req, res, next, optionsUsed) => {
    auditLog('rate_limit.exceeded', { limiter: limiterName, path: req.originalUrl, ip: req.ip });
    res.status(optionsUsed.statusCode).json(optionsUsed.message);
  };
}

function keyByCustomer(req) {
  return req.customerEmail || ipKeyGenerator(req.ip);
}

const chatLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByCustomer,
  message: { error: 'Too many chat requests, please try again shortly.' },
  handler: auditedHandler('chat'),
});

const ordersLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ORDERS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_ORDERS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByCustomer,
  message: { error: 'Too many order lookups, please try again shortly.' },
  handler: auditedHandler('orders'),
});

const authLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts, please try again shortly.' },
  handler: auditedHandler('auth'),
});

const adminLoginLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS) || 15 * 60_000,
  max: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
  handler: auditedHandler('admin_login'),
});

const productsLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PRODUCTS_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_PRODUCTS_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
  handler: auditedHandler('products'),
});

const promoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PROMO_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_PROMO_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByCustomer,
  message: { error: 'Too many promo code attempts, please try again shortly.' },
  handler: auditedHandler('promo'),
});

module.exports = { chatLimiter, ordersLimiter, authLimiter, adminLoginLimiter, productsLimiter, promoLimiter };
