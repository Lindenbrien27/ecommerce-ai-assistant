import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from './MessageBubble.jsx';
import { useChatConversation, SUGGESTED_PROMPTS } from '../hooks/useChatConversation.js';
import { useOrders } from '../context/OrdersContext.jsx';
import { SendIcon, SparkleIcon } from './icons.jsx';

// The storefront's docked right-side panel - a real, working client for the
// same /api/chat endpoint ChatPage.jsx talks to (via the shared
// useChatConversation hook), not a decorative mockup of one. Rendered only
// on non-/chat routes (see Layout.jsx) so there's never a second, redundant
// chat surface open at the same time as the full ChatPage.
export function AiAssistantPanel() {
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
  const [minimized, setMinimized] = useState(false);
  const logRef = useRef(null);
  const bodyWrapRef = useRef(null);
  const bodyRef = useRef(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [bubbles]);

  // The minimize/maximize glide - .ai-panel-body-wrap is flex: 1 with no
  // fixed height of its own (see index.css), so it can keep stretching to
  // fill however much of the tall panel is left below the header once
  // expanded (that's what pins the input at the very bottom of a short
  // conversation). A plain CSS transition can't animate toward that kind of
  // unconstrained, content-driven height, so this measures the real height
  // at the moment of each toggle and drives an explicit max-height instead -
  // same "measure it, don't guess it" idiom CategoryBadgesEditor's popover
  // already uses for its own dynamic max-height. Skipped on first mount -
  // there's nothing to animate from/to yet, and running it anyway would
  // pin an inline max-height at whatever the greeting/skeleton happened to
  // measure before any real content had loaded.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }
    const wrap = bodyWrapRef.current;
    const body = bodyRef.current;
    if (!wrap || !body) return undefined;

    if (minimized) {
      // Snap the current real height on as a starting point (no transition),
      // then let the next frame's drop to 0 actually animate - jumping
      // straight to "0" from an unset/auto max-height wouldn't have a real
      // starting value to glide from.
      wrap.style.transition = 'none';
      wrap.style.maxHeight = `${body.scrollHeight}px`;
      void wrap.offsetHeight; // force a reflow so the line above actually takes effect before the next one
      wrap.style.transition = '';
      const raf = requestAnimationFrame(() => {
        wrap.style.maxHeight = '0px';
      });
      return () => cancelAnimationFrame(raf);
    }

    wrap.style.maxHeight = `${body.scrollHeight}px`;
    // Once the glide open finishes, drop the inline cap entirely so
    // .ai-panel-body-wrap's own unconstrained flex: 1 takes back over at
    // rest - otherwise the panel would stay pinned at whatever height it
    // measured at the moment of this toggle instead of continuing to fill
    // the panel (or grow with a longer conversation) the way it did before
    // minimizing was ever touched.
    function clearCap() {
      wrap.style.maxHeight = '';
    }
    wrap.addEventListener('transitionend', clearCap, { once: true });
    return () => wrap.removeEventListener('transitionend', clearCap);
  }, [minimized]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    setInput('');
    sendMessage(text);
  }

  return (
    <aside className={`ai-panel${minimized ? ' ai-panel--minimized' : ''}`} aria-label="AI assistant">
      {/* The icon+name header itself is the toggle - a real <button>, not a
          separate close/expand control, since clicking it is the only way
          to minimize or reopen the panel. */}
      <button
        type="button"
        className="ai-panel-header"
        onClick={() => setMinimized((m) => !m)}
        aria-expanded={!minimized}
      >
        <span className="ai-panel-avatar" aria-hidden="true">
          <SparkleIcon width="16" height="16" />
        </span>
        <span className="ai-panel-header-text">
          <span className="ai-panel-title">AI Assistant</span>
          <span className="ai-panel-subtitle">Ask about your orders</span>
        </span>
      </button>

      {/* Always mounted now, not conditionally rendered while minimized -
          the effect above measures this real DOM content and drives
          .ai-panel-body-wrap's max-height directly, so minimizing glides
          the log/form shut instead of snapping them away. */}
      <div className="ai-panel-body-wrap" ref={bodyWrapRef}>
        <div className="ai-panel-body" ref={bodyRef}>
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
            tabIndex={minimized ? '-1' : '0'}
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
              disabled={pending || minimized}
              tabIndex={minimized ? '-1' : '0'}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className={`chat-send-button${input.trim() ? ' chat-send-button--active' : ''}`}
              disabled={pending || minimized}
              tabIndex={minimized ? '-1' : '0'}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
