import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from './components/MessageBubble.jsx';
import { VerifyForm } from './components/VerifyForm.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY));
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

  function handleVerified(newToken) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function handleAuthExpired() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setMessages([]);
    setBubbles([]);
  }

  function nextId() {
    nextIdRef.current += 1;
    return nextIdRef.current;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (res.status === 401) {
        handleAuthExpired();
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response - fall through to the generic error below
      }

      if (!res.ok) {
        const message = (data && data.error) || 'Something went wrong. Please try again.';
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

  if (!token) {
    return <VerifyForm onVerified={handleVerified} />;
  }

  return (
    <>
      <h1>Order Support Assistant</h1>
      <p className="subtitle">Ask about your order status or tracking - try "Where's my order?"</p>

      <div id="chat" ref={chatRef}>
        {bubbles.map((b) =>
          b.variant === 'pending' ? (
            <TypingIndicator key={b.id} />
          ) : (
            <MessageBubble key={b.id} role={b.role} content={b.content} variant={b.variant} />
          )
        )}
      </div>

      <form id="chat-form" onSubmit={handleSubmit}>
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
