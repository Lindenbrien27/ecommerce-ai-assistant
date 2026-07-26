import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from './MessageBubble.jsx';
import { useChatConversation, SUGGESTED_PROMPTS } from '../hooks/useChatConversation.js';
import { BrandMarkIcon } from './icons.jsx';

// The storefront's docked right-side panel - a real, working client for the
// same /api/chat endpoint ChatPage.jsx talks to (via the shared
// useChatConversation hook), not a decorative mockup of one. Rendered only
// on non-/chat routes (see Layout.jsx) so there's never a second, redundant
// chat surface open at the same time as the full ChatPage.
export function AiAssistantPanel() {
  const { bubbles, pending, sendMessage } = useChatConversation();
  const [input, setInput] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [bubbles]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    setInput('');
    sendMessage(text);
  }

  return (
    <aside className="ai-panel" aria-label="AI assistant">
      <div className="ai-panel-header">
        <span className="ai-panel-avatar" aria-hidden="true">
          <BrandMarkIcon width="16" height="16" />
        </span>
        <div>
          <p className="ai-panel-title">AI Assistant</p>
          <p className="ai-panel-subtitle">Ask about your orders</p>
        </div>
      </div>

      {/* Same scrollable-region-focusable reasoning as ChatPage's #chat -
          tabIndex so this is reachable and scrollable by keyboard once a
          longer conversation overflows the panel's fixed height. */}
      <div
        id="ai-panel-log"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with the AI assistant"
        tabIndex="0"
        className="ai-panel-log"
      >
        {bubbles.length === 0 && (
          <div className="ai-panel-greeting">
            <div className="msg-row">
              <span className="msg-avatar" aria-hidden="true">
                <BrandMarkIcon width="14" height="14" />
              </span>
              <div className="msg assistant">
                Hi! I can look up your orders, shipping status, and tracking. What do you need?
              </div>
            </div>
            <div className="ai-panel-suggestions">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => sendMessage(prompt)}
                  disabled={pending}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {bubbles.map((b) =>
          b.variant === 'pending' ? (
            <TypingIndicator key={b.id} />
          ) : (
            <MessageBubble key={b.id} role={b.role} content={b.content} variant={b.variant} />
          )
        )}
      </div>

      <form className="ai-panel-form" onSubmit={handleSubmit}>
        <label htmlFor="ai-panel-input" className="sr-only">
          Ask the AI assistant about your orders
        </label>
        <input
          id="ai-panel-input"
          type="text"
          placeholder="Ask anything about your orders..."
          autoComplete="off"
          required
          value={input}
          disabled={pending}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={pending}>
          Send
        </button>
      </form>
    </aside>
  );
}
