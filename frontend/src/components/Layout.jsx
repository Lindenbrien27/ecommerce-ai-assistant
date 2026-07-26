import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from './Brand.jsx';
import { ChatIcon, ChevronIcon, LogoutIcon, OrdersIcon } from './icons.jsx';

const NAV_LINKS = [
  { to: '/orders', label: 'My Orders', icon: OrdersIcon },
  { to: '/chat', label: 'Support Chat', icon: ChatIcon },
];

export function Layout() {
  const { email, logout } = useAuth();
  const location = useLocation();
  const linkRefs = useRef({});
  const [collapsed, setCollapsed] = useState(false);
  // null until the first measurement lands, so the indicator doesn't flash
  // at a wrong (0,0) position for one frame before it knows where the
  // active link actually is.
  const [indicator, setIndicator] = useState(null);

  useEffect(() => {
    function measure() {
      const active = NAV_LINKS.find((link) => location.pathname.startsWith(link.to));
      const el = active && linkRefs.current[active.to];
      if (el) {
        setIndicator({ top: el.offsetTop, height: el.offsetHeight });
      }
    }

    measure();
    // Collapsing/expanding changes each link's height slightly (icon-only
    // rows are shorter than icon+label rows) - re-measure so the indicator
    // doesn't end up pinned to a stale offset once the collapse transition
    // settles. Same reasoning as the resize listener: offsetTop/offsetHeight
    // can shift for reasons other than route changes.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [location.pathname, collapsed]);

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="app-shell app-shell--fixed-height">
      <aside className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}`}>
        <div className="app-sidebar-header">
          <Brand size="sm" showLabel={!collapsed} />
          <button
            type="button"
            className="app-sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <ChevronIcon />
          </button>
        </div>

        <nav className="app-sidebar-nav">
          {indicator && (
            <span
              className="app-sidebar-indicator"
              style={{ transform: `translateY(${indicator.top}px)`, height: `${indicator.height}px` }}
              aria-hidden="true"
            />
          )}
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              ref={(el) => {
                linkRefs.current[to] = el;
              }}
              className={({ isActive }) => (isActive ? 'active' : '')}
              data-tooltip={label}
            >
              <Icon className="app-sidebar-link-icon" aria-hidden="true" />
              <span className="app-sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-profile" data-tooltip={email || 'Account'}>
            <span className="app-sidebar-avatar" aria-hidden="true">
              {initial}
            </span>
            {/* title, not just the truncating ellipsis - the collapsed
                -only data-tooltip above covers the icon-only rail, but a
                long email still gets clipped in the expanded view too, and
                a native title tooltip works there without needing a
                second custom mechanism. */}
            <span className="app-sidebar-email" title={email}>
              {email}
            </span>
          </div>
          <button type="button" className="logout-button" onClick={logout} data-tooltip="Log out">
            <span className="app-sidebar-icon-slot" aria-hidden="true">
              <LogoutIcon width="16" height="16" />
            </span>
            <span className="app-sidebar-link-label">Log out</span>
          </button>
        </div>
      </aside>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
