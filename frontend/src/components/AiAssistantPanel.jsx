import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from './MessageBubble.jsx';
import { useChatConversation, SUGGESTED_PROMPTS } from '../hooks/useChatConversation.js';
import { useOrders } from '../context/OrdersContext.jsx';
import { SendIcon, SparkleIcon } from './icons.jsx';

// The storefront's docked right-side drawer - a real, working client for the
// same /api/chat endpoint ChatPage.jsx talks to (via the shared
// useChatConversation hook), not a decorative mockup of one. Rendered only
// on non-/chat routes (see Layout.jsx) so there's never a second, redundant
// chat surface open at the same time as the full ChatPage.
// isOpen is fully owned by Layout.jsx now, not local state here - the
// header below used to be its own button that minimized this panel to an
// icon rail; the single AI Assistant toggle in the page header is the only
// control left (see .ai-toggle), so this component just renders whichever
// state it's told instead of tracking one itself.
export function AiAssistantPanel({ isOpen }) {
  const { bubbles, pending, sendMessage } = useChatConversation();
  // This panel has no fetch of its own to gate on - the greeting/suggested-
  // prompts placeholder below is skeleton'd purely so the sidebar, center
  // page, and this panel all read as one app loading together and settle
  // together (see Layout.jsx/OrdersPage.jsx's own skeletons), not because
  // the AI assistant itself is waiting on the orders fetch. The input form
  // stays real and usable throughout - there's no actual reason chatting
  // has to wait for the order list.
  const { orders } = useOrders();
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
    <div className={`ai-drawer${isOpen ? '' : ' closed'}`}>
      <aside className="ai-panel" aria-label="AI assistant" aria-hidden={!isOpen}>
        {/* No longer a button - the page header's own AI Assistant toggle
            (see Layout.jsx) is the only way to open or close this now. */}
        <div className="ai-panel-header">
          <span className="ai-panel-avatar" aria-hidden="true">
            <SparkleIcon width="16" height="16" />
          </span>
          <span className="ai-panel-header-text">
            <span className="ai-panel-title">AI Assistant</span>
            <span className="ai-panel-subtitle">Ask about your orders</span>
          </span>
        </div>

        <div className="ai-panel-body">
          {/* Same scrollable-region-focusable reasoning as ChatPage's #chat -
              tabIndex so this is reachable and scrollable by keyboard once a
              longer conversation overflows the panel's fixed height. -1
              while closed, same as the form controls below, so a slid-away
              drawer never sits in the tab order. */}
          <div
            id="ai-panel-log"
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation with the AI assistant"
            tabIndex={isOpen ? '0' : '-1'}
            className="ai-panel-log slim-scroll"
          >
            {bubbles.length === 0 &&
              (orders === null ? (
                <div className="ai-panel-greeting-skeleton" aria-hidden="true">
                  <div className="msg-row">
                    <span className="skeleton ai-panel-skeleton-avatar" />
                    <span className="skeleton ai-panel-skeleton-line" />
                  </div>
                  <div className="ai-panel-skeleton-suggestions">
                    <span className="skeleton ai-panel-skeleton-chip" />
                    <span className="skeleton ai-panel-skeleton-chip" />
                    <span className="skeleton ai-panel-skeleton-chip" />
                  </div>
                </div>
              ) : (
                <div className="ai-panel-greeting fade-in">
                  <div className="msg-row">
                    <span className="msg-avatar" aria-hidden="true">
                      <SparkleIcon width="14" height="14" />
                    </span>
                    <div className="msg assistant">
                      Hi! I can look up your orders, shipping status, and tracking. What do you need?
                    </div>
                  </div>
                  <p className="ai-panel-suggested-label">Suggested</p>
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
              ))}
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
              disabled={pending || !isOpen}
              tabIndex={isOpen ? '0' : '-1'}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className={`chat-send-button${input.trim() ? ' chat-send-button--active' : ''}`}
              disabled={pending || !isOpen}
              tabIndex={isOpen ? '0' : '-1'}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
