const { runChat } = require('../services/aiService');
const { logError } = require('../utils/logger');

async function postChat(req, res) {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  try {
    const reply = await runChat(messages, req.customerEmail);
    res.json({ reply });
  } catch (err) {
    logError('Chat error', err);
    res.status(500).json({ error: 'Something went wrong processing your request.' });
  }
}

module.exports = { postChat };
  