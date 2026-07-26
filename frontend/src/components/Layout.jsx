import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Brand } from './Brand.jsx';
import {
  BellIcon,
  CartIcon,
  ChatIcon,
  ChevronDownIcon,
  GridIcon,
  HamburgerIcon,
  HeadsetIcon,
  HeartIcon,
  HomeIcon,
  LockIcon,
  LogoutIcon,
  OrdersIcon,
  PersonIcon,
  PinIcon,
  SearchIcon,
  ShopIcon,
} from './icons.jsx';

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// Most of this sidebar/top bar is intentionally inert - plain <span>s, not
// <button>s, copying a reference design's structure. This app has no
// catalog/wishlist/address-book/account-settings/dashboard backend for
// Home, Shop, Categories, Wishlist, My Account, Saved Address, or Change
// Password to actually do something - a non-interactive element styled to
// look clickable is more honest than a real control with no real behavior.
// My Orders, Support Chat, and Logout are the three that stay functional.
export function Layout() {
  const { email, logout } = useAuth();
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="storefront-shell">
      <header className="storefront-topbar">
        <span className="storefront-icon-btn" aria-hidden="true">
          <HamburgerIcon />
        </span>
        <Brand size="sm" />
        <div className="storefront-search" aria-hidden="true">
          <SearchIcon />
          <span>Search for products, orders...</span>
          <span className="storefront-search-kbd">⌘K</span>
        </div>
        <div className="storefront-topbar-icons" aria-hidden="true">
          <span className="storefront-icon-btn storefront-badge-wrap">
            <BellIcon />
            <span className="storefront-badge">2</span>
          </span>
          <span className="storefront-icon-btn storefront-badge-wrap">
            <CartIcon />
            <span className="storefront-badge">1</span>
          </span>
          <span className="storefront-profile-chip">
            <span className="storefront-avatar">{initial}</span>
            <span className="storefront-profile-text">
              <span className="storefront-profile-email">{email}</span>
            </span>
            <ChevronDownIcon />
          </span>
        </div>
      </header>

      <div className="storefront-body">
        <aside className="storefront-sidebar">
          <div className="storefront-greeting">
            <p className="storefront-greeting-label">{timeOfDayGreeting()},</p>
            <p className="storefront-greeting-email">{email}</p>
          </div>

          <nav className="storefront-sidenav">
            {/* Not a real destination distinct from My Orders below - this
                app has no separate dashboard/home page, and pointing both
                at /orders just meant both lit up "active" at once, which
                reads as a bug, not a feature. */}
            <span aria-hidden="true">
              <HomeIcon /> <span>Home</span>
            </span>
            <span aria-hidden="true">
              <ShopIcon /> <span>Shop</span> <ChevronDownIcon className="storefront-sidenav-chevron" />
            </span>
            <span aria-hidden="true">
              <GridIcon /> <span>Categories</span>
            </span>
            <span aria-hidden="true">
              <HeartIcon /> <span>Wishlist</span>
            </span>
            <span aria-hidden="true">
              <PersonIcon /> <span>My Account</span> <ChevronDownIcon className="storefront-sidenav-chevron" />
            </span>
            <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
              <OrdersIcon /> <span>My Orders</span>
            </NavLink>
            <span aria-hidden="true">
              <PinIcon /> <span>Saved Address</span>
            </span>
            <span aria-hidden="true">
              <LockIcon /> <span>Change Password</span>
            </span>
            <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
              <ChatIcon /> <span>Support Chat</span>
            </NavLink>
          </nav>

          <div className="storefront-help-card">
            <div className="storefront-help-card-header">
              <p>Need Help?</p>
              <HeadsetIcon />
            </div>
            <p className="storefront-help-card-text">Our support team is here for you.</p>
            <NavLink to="/chat" className="storefront-help-card-button">
              Chat Now <ChevronDownIcon className="storefront-chat-now-arrow" />
            </NavLink>
          </div>

          {/* Kept working, unlike the rest of this sidebar - with no other
              way to sign out, a decorative Logout would strand anyone
              verified with the "wrong" test account. */}
          <button type="button" className="storefront-logout" onClick={logout}>
            <LogoutIcon /> Logout
          </button>
        </aside>

        <main className="storefront-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
