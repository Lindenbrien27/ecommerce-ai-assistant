import { useState } from 'react';

export function VerifyForm({ onVerified }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), email: email.trim() }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response - fall through to the generic error below
      }

      if (!res.ok) {
        setError((data && data.error) || 'Something went wrong. Please try again.');
        return;
      }

      onVerified(data.token);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1>Order Support Assistant</h1>
      <p className="subtitle">Enter your order number and the email used to place it to get started.</p>

      <form id="verify-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Order number (e.g. ORD-1001)"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          disabled={pending}
          required
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Verifying...' : 'Verify'}
        </button>
        {error && <p className="verify-error">{error}</p>}
      </form>
    </>
  );
}
