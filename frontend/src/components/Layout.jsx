import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from './Brand.jsx';

const NAV_LINKS = [
  { to: '/orders', label: 'Orders' },
  { to: '/chat', label: 'Chat' },
];

export function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const linkRefs = useRef({});
  // null until the first measurement lands, so the indicator doesn't
  // flash at a wrong (0,0) position for one frame before it knows where
  // the active tab actually is.
  const [indicator, setIndicator] = useState(null);

  useEffect(() => {
    function measure() {
      const active = NAV_LINKS.find((link) => location.pathname.startsWith(link.to));
      const el = active && linkRefs.current[active.to];
      if (el) {
        setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
      }
    }

    measure();
    // Tab label width is fixed text, but the window resizing (or a
    // zoom/font change) can still shift offsetLeft/offsetWidth - re-measure
    // rather than let the indicator drift out of alignment.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Brand size="sm" />
        <div className="app-nav-links">
          {indicator && (
            <span
              className="app-nav-indicator"
              style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
              aria-hidden="true"
            />
          )}
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              ref={(el) => {
                linkRefs.current[link.to] = el;
              }}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {link.label}
            </NavLink>
          ))}
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
