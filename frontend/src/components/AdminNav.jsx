import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import {
  BrandMarkIcon,
  GridIcon,
  OrdersIcon,
  ShopIcon,
  PersonIcon,
  TicketIcon,
  LogoutIcon,
  PanelLeftIcon,
} from './icons.jsx';

// Row height (36px, .admin-sidenav-item) + row gap (4px, .admin-sidenav-list)
// in index.css - the sliding .admin-sidenav-indicator needs this fixed step
// to glide to the right row, same idiom as Layout.jsx's NAV_ROW_STEP.
const ADMIN_NAV_ROW_STEP = 40;

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // NavLink's own isActive still contributes an "active" class even when
  // className is a plain string (not a function) - it just concatenates.
  // Without `end` here, that internal match is a startsWith("/admin"),
  // which would also match /admin/customers. Keeping `end` pins NavLink's
  // own match to exactly "/admin" - ordersActive below is what extends
  // highlighting to /admin/orders/* detail pages on top of that.
  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');

  const navIndex = pathname.startsWith('/admin/dashboard')
    ? 0
    : ordersActive
      ? 1
      : pathname.startsWith('/admin/products')
        ? 2
        : pathname.startsWith('/admin/customers')
          ? 3
          : pathname.startsWith('/admin/promo-codes')
            ? 4
            : -1;

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="admin-nav-root">
      <div className="admin-shell-body">
        <aside className={`admin-sidebar${collapsed ? ' admin-sidebar--collapsed' : ''}`}>
          <div className="admin-sidebar-clip">
            <button
              type="button"
              className="admin-sidebar-brand-button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              <span className="admin-sidebar-brand-mark" aria-hidden="true">
                <BrandMarkIcon />
              </span>
              <span className="admin-sidebar-brand-name">Admin</span>
            </button>

            <nav className="admin-sidenav" aria-label="Admin sections">
              <div className="admin-sidenav-list">
                <span
                  className="admin-sidenav-indicator"
                  style={{
                    transform: `translateY(${Math.max(navIndex, 0) * ADMIN_NAV_ROW_STEP}px)`,
                    opacity: navIndex === -1 ? 0 : 1,
                  }}
                  aria-hidden="true"
                />
                <NavLink
                  to="/admin/dashboard"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <GridIcon /> <span className="admin-sidenav-label">Dashboard</span>
                </NavLink>
                <NavLink to="/admin" end className={`admin-sidenav-item${ordersActive ? ' active' : ''}`}>
                  <OrdersIcon /> <span className="admin-sidenav-label">Orders</span>
                </NavLink>
                <NavLink
                  to="/admin/products"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <ShopIcon /> <span className="admin-sidenav-label">Products</span>
                </NavLink>
                <NavLink
                  to="/admin/customers"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <PersonIcon /> <span className="admin-sidenav-label">Customers</span>
                </NavLink>
                <NavLink
                  to="/admin/promo-codes"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <TicketIcon /> <span className="admin-sidenav-label">Promo Codes</span>
                </NavLink>
              </div>
            </nav>
          </div>

          <div className="admin-account-row">
            <span className="admin-account-avatar" aria-hidden="true">{initial}</span>
            <span className="admin-account-email">{email}</span>
            <button type="button" className="admin-account-logout" onClick={logout} aria-label="Log out">
              <LogoutIcon />
            </button>
          </div>
        </aside>

        <div className="admin-nav-content">
          {collapsed && (
            <button
              type="button"
              className="sidebar-toggle admin-sidebar-reopen"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeftIcon open={false} />
            </button>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
