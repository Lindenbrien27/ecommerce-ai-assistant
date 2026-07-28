import { useRef, useState } from 'react';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';

const OTP_LENGTH = 6;

export function VerifyForm({ onVerified }) {
  const headingRef = useFocusOnMount();
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const otpRefs = useRef([]);

  async function handleRequestCode(e) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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

      // Only ever present outside production, and only when there's no real
      // email provider configured to have sent the code instead (see
      // authController.js) - safe to render unconditionally here since the
      // backend already refuses to include it in prod.
      setDevCode((data && data.devCode) || null);
      setDigits(Array(OTP_LENGTH).fill(''));
      setStep('otp');
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitCode(code) {
    setError(null);
    setPending(true);

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response - fall through to the generic error below
      }

      if (!res.ok) {
        setError((data && data.error) || 'Something went wrong. Please try again.');
        setDigits(Array(OTP_LENGTH).fill(''));
        otpRefs.current[0]?.focus();
        return;
      }

      onVerified(data.token);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function handleVerify(e) {
    e.preventDefault();
    submitCode(digits.join(''));
  }

  function handleDigitChange(index, rawValue) {
    const value = rawValue.replace(/[^0-9]/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    setDigits(Array(OTP_LENGTH).fill(''));
    setDevCode(null);
    await handleRequestCode({ preventDefault() {} });
  }

  if (step === 'otp') {
    return (
      <>
        <h1 ref={headingRef} tabIndex={-1}>
          Enter the code
        </h1>
        <p className="subtitle">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>

        {devCode && (
          <p className="field-hint">
            Dev mode - no email provider configured, so the code is shown here instead: <strong>{devCode}</strong>
          </p>
        )}

        <form id="otp-form" onSubmit={handleVerify}>
          <fieldset className="otp-fieldset">
            <legend className="sr-only">6-digit verification code</legend>
            <div className="otp-row">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-digit-${i}`}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  disabled={pending}
                  aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                  aria-describedby={error ? 'verify-error' : undefined}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                />
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={pending || digits.some((d) => !d)}>
            {pending ? 'Verifying...' : 'Verify'}
          </button>
          <button type="button" className="link-button" onClick={handleResend} disabled={pending}>
            Resend code
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep('email');
              setError(null);
              setDevCode(null);
            }}
            disabled={pending}
          >
            Use a different email
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

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        Track your orders
      </h1>
      <p className="subtitle">Enter your email and we'll send a 6-digit code to verify it's you.</p>

      <form id="verify-form" onSubmit={handleRequestCode}>
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
          {pending ? 'Sending code...' : 'Send code'}
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
