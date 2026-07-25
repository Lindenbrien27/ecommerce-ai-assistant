// Single source of truth for building a chat message bubble. Every bubble
// variant (user, assistant, pending, error) goes through this so the
// className construction and DOM shape stay consistent instead of being
// duplicated per call site.
export function createMessageBubble({ role, content = '', variant = null }) {
  const el = document.createElement('div');
  el.className = variant ? `msg ${role} ${variant}` : `msg ${role}`;
  el.textContent = content;
  return el;
}

export function createTypingIndicator() {
  const el = createMessageBubble({ role: 'assistant', variant: 'pending' });
  el.setAttribute('aria-label', 'Assistant is typing');
  el.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  return el;
}
