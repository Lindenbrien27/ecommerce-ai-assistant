import { AdminLoginForm } from '../components/AdminLoginForm.jsx';

export function AdminLoginPage() {
  return (
    <div className="admin-login-root">
      <div className="admin-login-card">
        <h1>Admin sign in</h1>
        <p className="subtitle">Sign in with the Google account on this catalog's admin allowlist.</p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
