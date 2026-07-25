import { createMessageBubble, createTypingIndicator } from './components/messageBubble.js';

// Encapsulates the chat widget's state (message history) and behavior
// behind a small factory instead of top-level script globals, so it could
// be mounted more than once or reused elsewhere without collisions.
export function initChatWidget({ apiKey, chatEl, formEl, inputEl }) {
  const messages = [];

  function scrollToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function appendBubble(bubble) {
    chatEl.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  function showError(el, message) {
    el.textContent = message;
    el.className = 'msg assistant error';
    scrollToBottom();
  }

  async function sendMessage(text) {
    messages.push({ role: 'user', content: text });
    appendBubble(createMessageBubble({ role: 'user', content: text }));

    const pendingEl = appendBubble(createTypingIndicator());

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ messages }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response - fall through to the generic error below
      }

      if (!res.ok) {
        showError(pendingEl, (data && data.error) || 'Something went wrong. Please try again.');
        return;
      }

      pendingEl.textContent = data.reply;
      pendingEl.className = 'msg assistant';
      messages.push({ role: 'assistant', content: data.reply });
    } catch {
      showError(pendingEl, "Couldn't reach the server. Please check your connection and try again.");
    }
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.disabled = true;

    try {
      await sendMessage(text);
    } finally {
      inputEl.disabled = false;
      inputEl.focus();
    }
  });
}
