import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble.jsx';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

// Each of these maps to one of the three real tools the assistant actually
// has (get_order_by_number, get_my_orders, get_order_by_tracking_number -
// see src/services/claudeTools.js) - not a wishlist. A prompt like "cancel
// my order" would just get a polite "I can't do that" reply, which is a
// worse first impression than not suggesting it at all.
const SUGGESTED_PROMPTS = ["Where's my order?", 'Show my recent orders', "What's my tracking number?"];

export function ChatPage() {
  useDocumentTitle('Chat');
  const headingRef = useFocusOnMount();
  const authorizedFetch = useAuthorizedFetch();
  const [messages, setMessages] = useState([]); // API conversation history: {role, content}
  const [bubbles, setBubbles] = useState([]); // render list: {id, role, content, variant}
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [bubbles]);

  function nextId() {
    nextIdRef.current += 1;
    return nextIdRef.current;
  }

  async function sendMessage(text) {
    if (!text || pending) return;

    setInput('');
    setPending(true);

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);

    const pendingId = nextId();
    setBubbles((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content: text },
      { id: pendingId, role: 'assistant', variant: 'pending' },
    ]);

    try {
      const res = await authorizedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (res.status === 401) {
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response - fall through to the generic error below
      }

      if (!res.ok) {
        const message =
          (data && data.error) ||
          'Unable to retrieve your order information. Verify your order number, try again in a moment, or contact support if this continues.';
        setBubbles((prev) =>
          prev.map((b) => (b.id === pendingId ? { ...b, content: message, variant: 'error' } : b))
        );
        return;
      }

      setBubbles((prev) =>
        prev.map((b) => (b.id === pendingId ? { ...b, content: data.reply, variant: null } : b))
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setBubbles((prev) =>
        prev.map((b) =>
          b.id === pendingId
            ? {
                ...b,
                content: "Couldn't reach the server. Please check your connection and try again.",
                variant: 'error',
              }
            : b
        )
      );
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input.trim());
  }

  function handleClear() {
    setMessages([]);
    setBubbles([]);
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
      <p className="field-hint">Press Enter to send</p>
    </>
  );
}
