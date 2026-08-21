import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gsiScriptPromise = null;

function loadGsiScript() {
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error('Failed to load Google Sign-In'));
    };
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

export function __resetGsiScriptStateForTests() {
  gsiScriptPromise = null;
}

export async function handleGoogleCredential(response, { login, navigate }) {
  const res = await fetch('/api/admin/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: response.credential }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  login(data.email);
  navigate('/admin');
  return true;
}

export function AdminLoginForm() {
  const buttonRef = useRef(null);
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {

      console.error('VITE_GOOGLE_CLIENT_ID is not set - admin Google Sign-In cannot be initialized.');
      setError("Admin sign-in isn't configured. Contact an administrator.");
      return undefined;
    }

    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: async (response) => {
            const ok = await handleGoogleCredential(response, { login, navigate });
            if (!cancelled && !ok) {
              setError('Sign-in was rejected. Contact an administrator if you believe this is a mistake.');
            }
          },
        });

        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'filled_black', size: 'large' });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load Google Sign-In. Please refresh and try again.");
        }
      });

    return () => {
      cancelled = true;
    };

  }, []);

  return (
    <div>
      <div ref={buttonRef} data-testid="google-signin-button" />
      {error && (
        <p role="alert" className="admin-login-error">
          {error}
        </p>
      )}
    </div>
  );
}
