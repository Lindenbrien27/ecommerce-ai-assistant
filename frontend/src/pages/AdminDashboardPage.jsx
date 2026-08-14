import { useAdminAuth } from '../context/AdminAuthContext.jsx';

// Placeholder only - the real Catalog Admin panel (product CRUD, promo
// assignment, stock) is explicitly out of scope for this plan (see
// docs/superpowers/specs/2026-08-14-admin-login-design.md > Non-goals).
// This page exists to prove the login -> protected route -> session
// round-trip actually works end to end before any of that gets built.
export function AdminDashboardPage() {
  const { email, logout } = useAdminAuth();
  return (
    <div className="admin-login-root">
      <div className="admin-login-card">
        <h1>Admin dashboard</h1>
        <p className="subtitle">Signed in as {email}.</p>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
