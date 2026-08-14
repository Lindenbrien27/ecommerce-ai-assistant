import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

// Split out from the useEffect below so it's directly testable without
// Google's real script, which never loads in a jsdom test environment -
// login/navigate are passed in rather than closed over so a test can
// supply plain vi.fn() spies instead of rendering through
// AdminAuthProvider + MemoryRouter just to get real ones. Returns whether
// login succeeded, purely so the test above has something to assert on.
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
      // A missing build-time env var, not a runtime failure a normal error
      // boundary would explain well - log clearly for whoever's debugging a
      // deploy, and surface something readable to whoever's stuck on the page.
      // eslint-disable-next-line no-console
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
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load Google Sign-In. Please refresh and try again.");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
