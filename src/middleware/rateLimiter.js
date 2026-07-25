const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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

// requireCustomerAuth always runs before these two limiters (see app.js),
// so req.customerEmail is already known - keying on it instead of req.ip
// means the budget is actually per-customer, which is what "too many
// requests" is supposed to mean once there's a verified identity. Keyed by
// IP alone (express-rate-limit's default), a single leaked/shared token
// hammered from many source addresses - or several customers who happen to
// sit behind one NAT/corporate IP - would either bypass the intended
// per-customer budget or wrongly share one, respectively. ipKeyGenerator
// (not req.ip directly) is the fallback for the one path that shouldn't
// ever hit it in practice - express-rate-limit's own IPv6-safe helper,
// since a naive raw-IP fallback would reintroduce the same subnet-bypass
// bug class the library's default keyGenerator already handles. authLimiter
// deliberately keeps the default (below) - it runs pre-auth, there's no
// customer identity yet to key on.
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
