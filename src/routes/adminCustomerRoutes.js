// src/routes/adminCustomerRoutes.js
const { Router } = require('express');
const { listCustomers, getCustomer, getCustomerOrders } = require('../controllers/adminCustomerController');

const router = Router();

router.get('/', listCustomers);
router.get('/:email', getCustomer);
router.get('/:email/orders', getCustomerOrders);

module.exports = router;
