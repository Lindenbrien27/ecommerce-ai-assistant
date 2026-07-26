import { useRef, useState } from 'react';
import { useAuthorizedFetch } from './useAuthorizedFetch.js';

// Each of these maps to one of the three real tools the assistant actually
// has (get_order_by_number, get_my_orders, get_order_by_tracking_number -
// see src/services/claudeTools.js) - not a wishlist. A prompt like "cancel
// my order" would just get a polite "I can't do that" reply, which is a
// worse first impression than not suggesting it at all.
export const SUGGESTED_PROMPTS = ["Where's my order?", 'Show my recent orders', "What's my tracking number?"];

// The real send/receive/error-handling logic behind /api/chat, shared by
// ChatPage (the full page) and the storefront's docked AiAssistantPanel -
// both talk to the same Claude-backed endpoint, so the request/response
// handling lives here once instead of twice. Each caller keeps its own
// input/focus/scroll wiring, which genuinely differs between a full page
// and a narrow docked panel.
export function useChatConversation() {
  const authorizedFetch = useAuthorizedFetch();
  const [messages, setMessages] = useState([]); // API conversation history: {role, content}
  const [bubbles, setBubbles] = useState([]); // render list: {id, role, content, variant}
  const [pending, setPending] = useState(false);
  const nextIdRef = useRef(0);

  function nextId() {
    nextIdRef.current += 1;
    return nextIdRef.current;
  }

  async function sendMessage(text) {
    if (!text || pending) return;
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
    }
  }

  function clear() {
    setMessages([]);
    setBubbles([]);
  }

  return { bubbles, pending, sendMessage, clear };
}
