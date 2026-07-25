import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from './Brand.jsx';

export function Layout() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Brand size="sm" />
        <div className="app-nav-links">
          <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
            Orders
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
            Chat
          </NavLink>
        </div>
        <button type="button" className="logout-button" onClick={logout}>
          Log out
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
