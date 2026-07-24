const { Router } = require('express');
const { postChat } = require('../controllers/chatController');

const router = Router();

router.post('/', postChat);

module.exports = router;
