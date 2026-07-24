const { runChat } = require('../services/aiService');

async function postChat(req, res) {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  try {
    const reply = await runChat(messages);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong processing your request.' });
  }
}

module.exports = { postChat };
