import { createContext, useContext, useEffect, useState } from 'react';

const AdminAuthContext = createContext(null);

// No token lives here at all - the admin session is an httpOnly cookie
// (see adminAuthController.js), unreadable to this or any other script by
// design. checked distinguishes "still finding out" from "confirmed
// logged out" so AdminProtectedRoute doesn't redirect during the brief
// window before the /me request resolves on first load.
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
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setEmail(null);
  }

  return <AdminAuthContext.Provider value={{ email, checked, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
