const path = require('path');
const express = require('express');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);

module.exports = app;
