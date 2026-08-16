const adminDashboardService = require('../services/adminDashboardService');
const { logError } = require('../utils/logger');

async function getDashboard(req, res) {
  try {
    const stats = await adminDashboardService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    logError('Admin dashboard error', err);
    res.status(500).json({ error: 'Something went wrong loading the dashboard.' });
  }
}

module.exports = { getDashboard };
