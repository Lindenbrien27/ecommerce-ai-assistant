import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function Layout() {
  const { logout } = useAuth();

  return (
    <>
      <nav className="app-nav">
        <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
          Orders
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
          Chat
        </NavLink>
        <button type="button" className="logout-button" onClick={logout}>
          Log out
        </button>
      </nav>
      <Outlet />
    </>
  );
}
