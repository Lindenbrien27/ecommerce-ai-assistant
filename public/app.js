const chatEl = document.getElementById('chat');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');

const messages = [];

function addMessage(role, content, pending = false) {
  const div = document.createElement('div');
  div.className = `msg ${role}${pending ? ' pending' : ''}`;
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.disabled = true;

  messages.push({ role: 'user', content: text });
  addMessage('user', text);

  const pendingEl = addMessage('assistant', 'Thinking...', true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Request failed');

    pendingEl.textContent = data.reply;
    pendingEl.classList.remove('pending');
    messages.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    pendingEl.textContent = `Error: ${err.message}`;
    pendingEl.classList.remove('pending');
  } finally {
    inputEl.disabled = false;
    inputEl.focus();
  }
});
