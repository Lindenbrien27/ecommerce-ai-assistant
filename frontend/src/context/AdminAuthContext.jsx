import { createContext, useContext, useEffect, useState } from 'react';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [email, setEmail] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setEmail(data ? data.email : null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function login(newEmail) {
    setEmail(newEmail);
  }

  async function logout() {

    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {

    }
    setEmail(null);
  }

  return <AdminAuthContext.Provider value={{ email, checked, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
