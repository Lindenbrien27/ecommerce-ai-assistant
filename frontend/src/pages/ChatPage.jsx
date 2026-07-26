import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble.jsx';
import { useChatConversation, SUGGESTED_PROMPTS } from '../hooks/useChatConversation.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function ChatPage() {
  useDocumentTitle('Chat');
  const headingRef = useFocusOnMount();
  const { bubbles, pending, sendMessage, clear } = useChatConversation();
  const [input, setInput] = useState('');

  const chatRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [bubbles]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    setInput('');
    sendMessage(text);
  }

  function handleClear() {
    clear();
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="chat-header">
        <h1 ref={headingRef} tabIndex={-1}>
          Order Support Assistant
        </h1>
        {bubbles.length > 0 && (
          <button type="button" className="chat-clear-button" onClick={handleClear} disabled={pending}>
            Clear chat
          </button>
        )}
      </div>
      <p className="subtitle">Ask about your order status or tracking - try "Where's my order?"</p>

      {/* tabIndex so a keyboard-only user can actually reach and scroll this
          region once its content overflows - a scrollable container with no
          focusable content inside it and no way to focus the container
          itself is a keyboard trap (WCAG 2.1.1/2.1.3, axe's
          scrollable-region-focusable rule). Only ever actually overflows on
          narrower viewports/longer transcripts - caught by the e2e a11y
          suite on Mobile Safari specifically, not locally on a wider
          desktop viewport where the same transcript fit without scrolling. */}
      <div
        id="chat"
        ref={chatRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        tabIndex="0"
      >
        {bubbles.length === 0 && (
          <div className="chat-empty-state">
            <p className="chat-empty-state-label">Try asking:</p>
            <div className="chat-suggestions">
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

      <form id="chat-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="sr-only">
          Ask about your order
        </label>
        <input
          id="chat-input"
          ref={inputRef}
          type="text"
          placeholder="Ask about your order..."
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
    </>
  );
}
