const path = require('path');
const express = require('express');
const pinoHttp = require('pino-http');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireCustomerAuth } = require('./middleware/customerAuth');
const { chatLimiter, ordersLimiter, authLimiter } = require('./middleware/rateLimiter');
const { enforceHttps } = require('./middleware/httpsEnforce');
const { logger } = require('./config/logger');

const app = express();

if (process.env.NODE_ENV === 'production') {
  // Render terminates TLS at its edge and forwards plain HTTP to us over
  // exactly one hop - trust proxy: 1 tells Express to derive req.secure
  // (and req.ip) from the X-Forwarded-* headers that hop sets, rather than
  // the raw (always-plain-HTTP) socket. This also makes the rate limiters'
  // per-client IP tracking accurate behind the proxy, instead of every
  // request appearing to come from Render's single forwarding address.
  app.set('trust proxy', 1);
  app.use(enforceHttps);
}

// Structured request/response logging (method, url, status, response time,
// a generated request id) for every request, including ones that never
// reach a route (404s, auth rejections, rate limits).
app.use(pinoHttp({ logger }));

app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// A customer proves ownership of an order (order number + email) here and
// gets back a token scoped to their own email - no shared secret involved.
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/chat', requireCustomerAuth, chatLimiter, chatRoutes);
app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);

module.exports = app;
