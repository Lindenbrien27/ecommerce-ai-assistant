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
      <p className="subtitle">Verify your identity with the email used to place an order and its order number.</p>

      <form id="verify-form" onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="order-number">Order Number</label>
          <input
            id="order-number"
            type="text"
            placeholder="e.g. ORD-1001"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            disabled={pending}
            aria-describedby={error ? 'verify-error' : 'order-number-hint'}
            required
          />
          <p id="order-number-hint" className="field-hint">
            You'll find this in your order confirmation email.
          </p>
        </div>
        <div className="input-group">
          <label htmlFor="verify-email">Email Address</label>
          <input
            id="verify-email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            aria-describedby={error ? 'verify-error' : undefined}
            required
          />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? 'Verifying...' : 'Verify Order'}
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
