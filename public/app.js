// NOTE: this is a shared secret visible to anyone who views this page's
// source - it only keeps out anonymous bots hitting the API directly.
// Replace with real per-customer auth before handling real order data.
// The actual value is injected by the server at request time (see
// src/app.js) so it never lives in this tracked file.
const API_KEY = '__API_KEY__';

const chatEl = document.getElementById('chat');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');

const messages = [];

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function addPendingMessage() {
  const div = document.createElement('div');
  div.className = 'msg assistant pending';
  div.setAttribute('aria-label', 'Assistant is typing');
  div.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function showError(el, message) {
  el.textContent = message;
  el.className = 'msg assistant error';
  chatEl.scrollTop = chatEl.scrollHeight;
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.disabled = true;

  messages.push({ role: 'user', content: text });
  addMessage('user', text);

  const pendingEl = addPendingMessage();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
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
  } finally {
    inputEl.disabled = false;
    inputEl.focus();
  }
});
