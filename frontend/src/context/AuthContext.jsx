import { createContext, useContext, useMemo, useState } from 'react';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';
const AuthContext = createContext(null);

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
