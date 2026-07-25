import { useEffect, useRef, useState } from 'react';
import { MessageBubble, TypingIndicator } from './components/MessageBubble.jsx';

export default function App() {
  const [apiKey, setApiKey] = useState(null);
  const [messages, setMessages] = useState([]); // API conversation history: {role, content}
  const [bubbles, setBubbles] = useState([]); // render list: {id, role, content, variant}
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    // The API key is fetched at runtime rather than baked into the build,
    // so rotating it server-side doesn't require a frontend rebuild. It's
    // still visible to any browser visitor by design - see README Auth
    // section - this just changes how it's delivered.
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setApiKey(data.apiKey || ''))
      .catch(() => setApiKey(''));
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [bubbles]);

  function nextId() {
    nextIdRef.current += 1;
    return nextIdRef.current;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || !apiKey) return;

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
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ messages: nextMessages }),
      });

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

  const formDisabled = pending || !apiKey;

  return (
    <>
      <h1>Order Support Assistant</h1>
      <p className="subtitle">Ask about an order status or tracking - try "Where's my order ORD-1001?"</p>

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
          disabled={formDisabled}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={formDisabled}>
          Send
        </button>
      </form>
    </>
  );
}
