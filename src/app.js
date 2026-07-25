const path = require('path');
const express = require('express');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireApiKey } = require('./middleware/apiKeyAuth');
const { chatLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/chat', requireApiKey, chatLimiter, chatRoutes);
app.use('/api/orders', requireApiKey, orderRoutes);

module.exports = app;
