const path = require('path');
const express = require('express');
const pinoHttp = require('pino-http');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireApiKey } = require('./middleware/apiKeyAuth');
const { chatLimiter, ordersLimiter } = require('./middleware/rateLimiter');
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

// The frontend is a built React app (frontend/dist, produced by
// `npm run build`) served as static assets. It fetches this at runtime for
// its API key instead of the key being baked into the build - that way
// rotating the key server-side doesn't require rebuilding the frontend. The
// key is still visible to any browser visitor by design; see README Auth.
app.get('/api/config', (req, res) => {
  res.json({ apiKey: process.env.API_KEY || '' });
});

app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/chat', requireApiKey, chatLimiter, chatRoutes);
app.use('/api/orders', requireApiKey, ordersLimiter, orderRoutes);

module.exports = app;
