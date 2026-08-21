const path = require('path');
const express = require('express');
const compression = require('compression');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('../openapi.json');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const adminCustomerRoutes = require('./routes/adminCustomerRoutes');
const productRoutes = require('./routes/productRoutes');
const adminProductRoutes = require('./routes/adminProductRoutes');
const promoCodeRoutes = require('./routes/promoCodeRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const adminPromoCodeRoutes = require('./routes/adminPromoCodeRoutes');
const adminInventoryRoutes = require('./routes/adminInventoryRoutes');
const adminReviewRoutes = require('./routes/adminReviewRoutes');
const cookieParser = require('cookie-parser');
const { requireCustomerAuth } = require('./middleware/customerAuth');
const { requireAdminAuth } = require('./middleware/adminAuth');
const { chatLimiter, ordersLimiter, authLimiter, productsLimiter, promoLimiter } = require('./middleware/rateLimiter');
const { enforceHttps } = require('./middleware/httpsEnforce');
const { securityHeaders, apiDocsStyleOverride, adminCspOverride, adminCoopOverride } = require('./middleware/securityHeaders');
const { logger } = require('./config/logger');
const { logError } = require('./utils/logger');
const Sentry = require('./config/sentry');
const { pool } = require('./config/db');

const app = express();

app.use(securityHeaders);

if (process.env.NODE_ENV === 'production') {

  app.set('trust proxy', 1);
  app.use(enforceHttps);
}

app.use(pinoHttp({ logger }));

app.use(express.json());
app.use(cookieParser());

app.use(compression());

const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use(
  express.static(FRONTEND_DIST, {
    setHeaders(res, filePath) {
      if (filePath.startsWith(path.join(FRONTEND_DIST, 'assets') + path.sep)) {

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {

        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    logError('Database health check failed', err);
    res.status(503).json({ status: 'error' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/chat', requireCustomerAuth, chatLimiter, chatRoutes);
app.use('/api/orders', requireCustomerAuth, ordersLimiter, orderRoutes);
app.use('/api/promo-codes', requireCustomerAuth, promoLimiter, promoCodeRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/orders', requireAdminAuth, adminOrderRoutes);
app.use('/api/admin/customers', requireAdminAuth, adminCustomerRoutes);
app.use('/api/admin/products', requireAdminAuth, adminProductRoutes);
app.use('/api/admin/dashboard', requireAdminAuth, adminDashboardRoutes);
app.use('/api/admin/promo-codes', requireAdminAuth, adminPromoCodeRoutes);
app.use('/api/admin/inventory', requireAdminAuth, adminInventoryRoutes);
app.use('/api/admin/reviews', requireAdminAuth, adminReviewRoutes);

app.use('/api/products', productsLimiter, productRoutes);

app.get('/openapi.json', (req, res) => res.json(openApiSpec));

app.use('/api-docs', apiDocsStyleOverride);
app.use('/api-docs', swaggerUi.serveFiles(openApiSpec));
app.get('/api-docs', (req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>API docs - Order Support Assistant</title>
<link rel="stylesheet" href="./swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="./swagger-ui-bundle.js"></script>
<script src="./swagger-ui-standalone-preset.js"></script>
<script src="./swagger-ui-init.js"></script>
</body>
</html>`);
});

app.get(['/admin', '/admin/*'], adminCspOverride, adminCoopOverride, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML);
});

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML);
});

Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, _next) => {
  logError('Unhandled request error', err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body.' });
  }
  res.status(500).json({ error: 'Something went wrong.' });
});

module.exports = app;
