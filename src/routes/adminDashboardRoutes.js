const { Router } = require('express');
const { getDashboard } = require('../controllers/adminDashboardController');

const router = Router();

router.get('/', getDashboard);

module.exports = router;
