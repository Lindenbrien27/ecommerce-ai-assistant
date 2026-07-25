const fs = require('fs');
const path = require('path');
const express = require('express');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireApiKey } = require('./middleware/apiKeyAuth');
const { chatLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(express.json());

// Registered before express.static so this takes precedence over the
// static public/app.js file - the API key placeholder is swapped for the
// real value at request time, so the real key never lives in tracked source.
app.get('/app.js', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'app.js');
  const content = fs.readFileSync(filePath, 'utf8').replace('__API_KEY__', process.env.API_KEY || '');
  res.type('application/javascript').send(content);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/chat', requireApiKey, chatLimiter, chatRoutes);
app.use('/api/orders', requireApiKey, orderRoutes);

module.exports = app;
