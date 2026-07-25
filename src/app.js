const path = require('path');
const express = require('express');
const compression = require('compression');
const pinoHttp = require('pino-http');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireCustomerAuth } = require('./middleware/customerAuth');
const { chatLimiter, ordersLimiter, authLimiter } = require('./middleware/rateLimiter');
const { enforceHttps } = require('./middleware/httpsEnforce');
const { securityHeaders } = require('./middleware/securityHeaders');
const { logger } = require('./config/logger');

const app = express();

app.use(securityHeaders);

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

// Gzips/brotli-compresses JSON and static responses based on the client's
// Accept-Encoding - without this, the ~189KB JS bundle (and every API
// response) was going out over the wire completely uncompressed, ~3x
// larger than necessary, on every single request.
app.use(compression());

const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');

app.use(
  express.static(FRONTEND_DIST, {
    setHeaders(res, filePath) {
      if (filePath.startsWith(path.join(FRONTEND_DIST, 'assets') + path.sep)) {
        // Vite content-hashes filenames under assets/ (e.g. index-BkBoJTlF.js)
        // - the hash changes whenever the content does, so it's always safe,
        // and valuable, to tell the browser to cache these forever.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // index.html references the *current* hashed asset filenames by
        // name - serving a stale copy would point the browser at assets
        // that no longer exist. no-cache still allows caching, just forces
        // revalidation (a fast 304 when unchanged) on every load.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// A customer proves ownership of an order (order number + email) here and
// gets back a token scoped to their own email - no shared secret involved.
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/chat', requireCustomerAuth, chatLimiter, chatRoutes);
app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);

// SPA fallback: anything that isn't a static asset or an API route is a
// client-side route (e.g. /orders/ORD-1001) - hand it index.html and let
// React Router take over, so direct navigation/refresh on those URLs works.
// Same no-cache reasoning as the express.static case above - this is the
// same file, just reached by a different path.
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML);
});

module.exports = app;
