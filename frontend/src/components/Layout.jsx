import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from './Brand.jsx';
import {
  BellIcon,
  CartIcon,
  ChatIcon,
  ChevronDownIcon,
  HamburgerIcon,
  HeartIcon,
  LockIcon,
  LogoutIcon,
  OrdersIcon,
  PersonIcon,
  PinIcon,
  SearchIcon,
} from './icons.jsx';

// Decorative-only chrome copying a reference storefront design's top bar -
// this app has no catalog/blog/wishlist/address-book backend for any of
// these to actually link to. Plain <span>s, not <button>s: they're not
// real controls (nothing happens on activation), so giving them native
// button semantics would mean either a broken keyboard/AT experience
// (focusable, announced as a button, does nothing) or fighting that with
// tabIndex/aria-hidden on every one - a non-interactive element styled to
// look clickable for mouse users is simpler and more honest about what it
// actually is.
const CATEGORIES = ['New Arrivals', 'Sale'];
const QUICK_LINKS = ['Men', 'Women', 'Children', 'Brand'];

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function Layout() {
  const { email, logout } = useAuth();

  return (
    <div className="storefront-shell">
      <header className="storefront-topbar">
        <span className="storefront-icon-btn" aria-hidden="true">
          <HamburgerIcon />
        </span>
        <Brand size="sm" />
        <div className="storefront-categories">
          <span className="storefront-category" aria-hidden="true">
            Clothing <ChevronDownIcon />
          </span>
          {CATEGORIES.map((label) => (
            <span className="storefront-category" aria-hidden="true" key={label}>
              {label}
            </span>
          ))}
        </div>
        <div className="storefront-search" aria-hidden="true">
          <span>Search...</span>
          <SearchIcon />
        </div>
        <div className="storefront-quicklinks" aria-hidden="true">
          {QUICK_LINKS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="storefront-topbar-icons" aria-hidden="true">
          <span className="storefront-icon-btn">
            <BellIcon />
          </span>
          <span className="storefront-icon-btn">
            <CartIcon />
          </span>
          <span className="storefront-icon-btn">
            <PersonIcon />
          </span>
        </div>
      </header>

      <div className="storefront-accountbar">
        <div className="storefront-greeting">
          <p className="storefront-greeting-label">{timeOfDayGreeting()},</p>
          <p className="storefront-greeting-name">{email}</p>
        </div>
        <nav className="storefront-pills">
          <span className="storefront-pill" aria-hidden="true">
            <PersonIcon width="14" height="14" /> Profile
          </span>
          <span className="storefront-pill" aria-hidden="true">
            <HeartIcon /> Wishlist
          </span>
          <NavLink to="/orders" className={({ isActive }) => `storefront-pill${isActive ? ' active' : ''}`}>
            <OrdersIcon width="14" height="14" /> My Order
          </NavLink>
          <span className="storefront-pill" aria-hidden="true">
            <PinIcon /> Saved Address
          </span>
          <span className="storefront-pill" aria-hidden="true">
            <LockIcon /> Change Password
          </span>
          {/* Not part of the reference design - this app's own Chat
              assistant still needs to be reachable from somewhere, and
              dropping it entirely would be a real functional regression,
              not just a trimmed decorative link. */}
          <NavLink to="/chat" className={({ isActive }) => `storefront-pill${isActive ? ' active' : ''}`}>
            <ChatIcon width="14" height="14" /> Support Chat
          </NavLink>
          {/* Also kept working, unlike the rest of this row - with no other
              way to sign out, a purely decorative Logout pill would strand
              anyone who verified with the "wrong" test account. */}
          <button type="button" className="storefront-pill" onClick={logout}>
            <LogoutIcon width="14" height="14" /> Logout
          </button>
        </nav>
      </div>

      <main className="storefront-content">
        <Outlet />
      </main>
    </div>
  );
}
