import { createContext, useContext, useState } from 'react';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY));

  function login(newToken) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
