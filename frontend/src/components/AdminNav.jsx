import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import {
  BrandMarkIcon,
  GridIcon,
  OrdersIcon,
  ShopIcon,
  PersonIcon,
  TicketIcon,
  StarIcon,
  LogoutIcon,
  PanelLeftIcon,
  BoxIcon,
  LedgerIcon,
  AlertTriangleIcon,
  ClipboardIcon,
  ChevronDownIcon,
} from './icons.jsx';

export function AdminNav() {
  const { email, logout } = useAdminAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const ordersActive = pathname === '/admin' || pathname.startsWith('/admin/orders');
  const inventoryActive = pathname.startsWith('/admin/inventory');

  const [inventoryExpanded, setInventoryExpanded] = useState(inventoryActive);
  useEffect(() => {
    if (inventoryActive) setInventoryExpanded(true);
  }, [pathname, inventoryActive]);

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

                <button
                  type="button"
                  className={`admin-sidenav-item admin-sidenav-group${inventoryActive ? ' active' : ''}`}
                  onClick={() => setInventoryExpanded((e) => !e)}
                  aria-expanded={inventoryExpanded}
                >
                  <BoxIcon /> <span className="admin-sidenav-label">Inventory</span>
                  <ChevronDownIcon className="admin-sidenav-chevron" aria-hidden="true" />
                </button>
                {inventoryExpanded && (
                  <div className="admin-sidenav-subgroup">
                    <NavLink
                      to="/admin/inventory"
                      end
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <LedgerIcon /> <span className="admin-sidenav-label">Stock Ledger</span>
                    </NavLink>
                    <NavLink
                      to="/admin/inventory/reorder"
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <AlertTriangleIcon /> <span className="admin-sidenav-label">Reorder Queue</span>
                    </NavLink>
                    <NavLink
                      to="/admin/inventory/purchase-orders"
                      className={({ isActive }) => `admin-sidenav-subitem${isActive ? ' active' : ''}`}
                    >
                      <ClipboardIcon /> <span className="admin-sidenav-label">Purchase Orders</span>
                    </NavLink>
                  </div>
                )}

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
                <NavLink
                  to="/admin/reviews"
                  className={({ isActive }) => `admin-sidenav-item${isActive ? ' active' : ''}`}
                >
                  <StarIcon /> <span className="admin-sidenav-label">Reviews</span>
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
