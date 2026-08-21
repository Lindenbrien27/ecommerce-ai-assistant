const adminReviewService = require('../services/adminReviewService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

function parsePositiveInt(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

async function listReviews(req, res) {
  const page = parsePositiveInt(req.query.page);
  if (Number.isNaN(page)) return res.status(400).json({ error: 'page must be a positive integer.' });
  const pageSize = parsePositiveInt(req.query.pageSize);
  if (Number.isNaN(pageSize)) return res.status(400).json({ error: 'pageSize must be a positive integer.' });

  try {
    const result = await adminReviewService.getReviews({
      q: req.query.q || null,
      status: req.query.status || null,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    logError('Admin review list error', err);
    res.status(500).json({ error: 'Something went wrong looking up reviews.' });
  }
}

async function updateReviewStatus(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (Number.isNaN(id) || id === undefined) return res.status(400).json({ error: 'id must be a positive integer.' });

  try {
    const review = await adminReviewService.updateReviewStatus(id, req.body.status);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    auditLog('admin.review.status_updated', { id, status: req.body.status, admin: req.adminEmail });
    res.json(review);
  } catch (err) {
    if (err instanceof adminReviewService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    logError('Admin review update error', err);
    res.status(500).json({ error: 'Something went wrong updating that review.' });
  }
}

async function deleteReview(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (Number.isNaN(id) || id === undefined) return res.status(400).json({ error: 'id must be a positive integer.' });

  try {
    const deleted = await adminReviewService.deleteReview(id);
    if (!deleted) return res.status(404).json({ error: 'Review not found' });
    auditLog('admin.review.deleted', { id, admin: req.adminEmail });
    res.json({ ok: true });
  } catch (err) {
    logError('Admin review delete error', err);
    res.status(500).json({ error: 'Something went wrong deleting that review.' });
  }
}

module.exports = { listReviews, updateReviewStatus, deleteReview };
