const { Router } = require('express');
const { listReviews, updateReviewStatus, deleteReview } = require('../controllers/adminReviewController');

const router = Router();

router.get('/', listReviews);
router.patch('/:id', updateReviewStatus);
router.delete('/:id', deleteReview);

module.exports = router;
