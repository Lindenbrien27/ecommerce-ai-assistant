import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  return (
    <div className="admin-nav-root">
      <nav className="admin-nav-bar" aria-label="Admin sections">
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink to="/admin" end className={`admin-nav-link${ordersActive ? ' active' : ''}`}>
          Orders
        </NavLink>
        <NavLink
          to="/admin/products"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Products
        </NavLink>
        <NavLink
          to="/admin/customers"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Customers
        </NavLink>
        <NavLink
          to="/admin/promo-codes"
          className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
        >
          Promo Codes
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
