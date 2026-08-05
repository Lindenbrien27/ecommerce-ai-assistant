const { Router } = require('express');
const { getProfile, updateProfile } = require('../controllers/accountController');

const router = Router();

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

module.exports = router;
