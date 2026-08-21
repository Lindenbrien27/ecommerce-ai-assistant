import { useRef, useState } from 'react';
import { useAuthorizedFetch } from './useAuthorizedFetch.js';

export const SUGGESTED_PROMPTS = ["Where's my order?", 'Show my recent orders', "What's my tracking number?"];

export function useChatConversation() {
  const authorizedFetch = useAuthorizedFetch();
  const [messages, setMessages] = useState([]);
  const [bubbles, setBubbles] = useState([]);
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
