import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    loadGsiScript().then(() => {
      if (cancelled || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (response) => handleGoogleCredential(response, { login, navigate }),
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={buttonRef} data-testid="google-signin-button" />;
}
