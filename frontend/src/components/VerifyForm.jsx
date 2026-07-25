import { useState } from 'react';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';

export function VerifyForm({ onVerified }) {
  const headingRef = useFocusOnMount();
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
      <h1 ref={headingRef} tabIndex={-1}>
        Order Support Assistant
      </h1>
      <p className="subtitle">Enter your order number and the email used to place it to get started.</p>

      <form id="verify-form" onSubmit={handleSubmit}>
        <label htmlFor="order-number" className="sr-only">
          Order number
        </label>
        <input
          id="order-number"
          type="text"
          placeholder="Order number (e.g. ORD-1001)"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          disabled={pending}
          aria-describedby={error ? 'verify-error' : undefined}
          required
        />
        <label htmlFor="verify-email" className="sr-only">
          Email address
        </label>
        <input
          id="verify-email"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-describedby={error ? 'verify-error' : undefined}
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Verifying...' : 'Verify'}
        </button>
        {error && (
          <p id="verify-error" className="verify-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
