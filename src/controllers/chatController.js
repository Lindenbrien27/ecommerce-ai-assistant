const { runChat } = require('../services/aiService');
const { logError } = require('../utils/logger');

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 8000;

// The client-supplied `messages` array becomes the literal first turn of
// the conversation sent to the model (aiService.runChat) - found during a
// security review, not a hypothetical: unvalidated, it's both a real
// prompt-injection surface (Anthropic's message `content` can be an array
// of blocks, including fabricated tool_use/tool_result entries claiming a
// tool already ran and returned attacker-chosen data, which nothing here
// would ever produce for a genuine request) and an unbounded-cost one -
// every accepted message gets forwarded to a metered, billed third-party
// API on every request. The real frontend (ChatPage.jsx) only ever sends
// plain-string content for role user/assistant, so requiring exactly that
// shape costs the legitimate client nothing.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages must be a non-empty array';
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages must not exceed ${MAX_MESSAGES} entries`;
  }
  for (const message of messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      return `each message must be { role: "user" | "assistant", content: a non-empty string up to ${MAX_MESSAGE_LENGTH} characters }`;
    }
  }
  return null;
}

async function postChat(req, res) {
  const { messages } = req.body;

  const validationError = validateMessages(messages);
  if (validationError) {
    return res.status(400).json({ error: validationError });
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
  