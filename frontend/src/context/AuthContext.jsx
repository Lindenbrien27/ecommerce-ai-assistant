import { createContext, useContext, useMemo, useState } from 'react';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';
const AuthContext = createContext(null);

// Display-only (sidebar profile chip) - every real API call re-verifies the
// token server-side via authService.verifyToken regardless, so a malformed
// or foreign string here just means no email to show, not a security gap.
function decodeEmail(token) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).email ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY));
  const email = useMemo(() => decodeEmail(token), [token]);

  function login(newToken) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, email, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
