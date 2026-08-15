import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  // NavLink's own isActive still contributes an "active" class even when
  // className is a plain string (not a function) - it just concatenates.
  // Without `end` here, that internal match is a startsWith("/admin"),
  // which would also match /admin/customers. Keeping `end` pins NavLink's
  // own match to exactly "/admin"; ordersActive below is what extends
  // highlighting to /admin/orders/* detail pages on top of that.
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  return (
    <div className="admin-nav-root">
      <nav className="admin-nav-bar" aria-label="Admin sections">
        <NavLink to="/admin" end className={`admin-nav-link${ordersActive ? ' active' : ''}`}>
          Orders
        </NavLink>
        <NavLink
          to="/admin/customers"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Customers
        </NavLink>
        <span className="admin-nav-spacer" />
        <span className="admin-nav-email">{email}</span>
        <button type="button" className="admin-nav-logout" onClick={logout}>
          Log out
        </button>
      </nav>
      <div className="admin-nav-content">
        <Outlet />
      </div>
    </div>
  );
}
