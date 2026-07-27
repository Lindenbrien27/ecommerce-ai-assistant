import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { OrdersProvider, useOrders } from '../context/OrdersContext.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { Brand } from './Brand.jsx';
import { AiAssistantPanel } from './AiAssistantPanel.jsx';
import {
  ChatIcon,
  ChevronDownIcon,
  HeartIcon,
  MoonIcon,
  OrdersIcon,
  LogoutIcon,
  PersonIcon,
  PlusIcon,
  QuestionIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TicketIcon,
} from './icons.jsx';

// Purely decorative labels, matching this app's own 5 real products (see
// PRODUCT_ICONS in icons.jsx) rather than the clothing categories ("tshirt,
// pants") in the reference screenshot this section is modeled on - this
// store doesn't sell clothes, and labeling a filter with categories that
// don't match anything in the real catalog would be a worse copy of the
// reference than adapting it to what's actually here. Each one gets its
// own accent color - the one deliberate spot of color in an otherwise
// strictly monochrome app, since a flat gray badge doesn't read as a
// "badge" the way a reference tag chip does. Two RGB triples, not one - a
// mid-saturation hue (e.g. violet-500) can't hit 4.5:1 text contrast
// against its own low-opacity tint in BOTH themes at once, since that tint
// renders as a pale wash on light mode's near-white cards but a deep wash
// on dark mode's near-black ones. `light` (an 800-level shade) is dark
// enough for the pale version; `dark` (a 200-level shade) is light enough
// for the deep version - aria-hidden doesn't exempt this from WCAG
// contrast the way it exempts it from screen readers, since a low-vision
// sighted user still has to read it. Found by axe, not assumed - a fixed
// mid-tone (checked live before this) failed at 2.3:1-3.4:1 depending on
// hue, well under the 4.5:1 minimum.
const CATEGORY_TAGS = [
  { label: 'Audio', light: '91, 33, 182', dark: '221, 214, 254' },
  { label: 'Cables', light: '7, 89, 133', dark: '186, 230, 253' },
  { label: 'Peripherals', light: '22, 101, 52', dark: '187, 247, 208' },
  { label: 'Furniture', light: '146, 64, 14', dark: '253, 230, 138' },
  { label: 'Displays', light: '153, 27, 27', dark: '254, 202, 202' },
];

// Most of this sidebar/content-header is intentionally inert - plain
// <span>s, not <button>s, copying a reference design's structure. This app
// has no coupon/wishlist/FAQ/settings/profile-editing/global-search backend
// for those items to actually do something - a non-interactive element
// styled to look clickable is more honest than a real control with no real
// behavior. My Orders, Support Chat, Logout, the theme toggle, and the AI
// Assistant panel are the ones that stay functional. My Orders' and
// Coupons' counts are real numbers derived from the signed-in customer's
// own orders, not placeholders - Wishlist has no backing data at all, so it
// gets no number rather than a fabricated one.
// OrdersProvider wraps LayoutInner (not the other way around) so this outer
// component can stay the default export React Router renders for every
// authenticated route, while still giving LayoutInner - and, via Outlet,
// OrdersPage below it - access to the one shared order-list fetch.
export function Layout() {
  return (
    <OrdersProvider>
      <LayoutInner />
    </OrdersProvider>
  );
}

function LayoutInner() {
  const { email, logout } = useAuth();
  const { orders } = useOrders();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const initial = email ? email[0].toUpperCase() : '?';
  const orderCount = orders ? orders.length : null;
  const voucherCount = orders ? orders.filter((o) => o.voucher_cents > 0).length : null;

  const showAiPanel = location.pathname !== '/chat';

  return (
    <div className="storefront-shell">
      {/* No more full-width global top bar - the brand lives at the top of
          the sidebar below, and the (decorative) search bar + real theme
          toggle live in the main content card's own header instead, same
          as the reference this shell is modeled on. */}
      <div className="storefront-body">
        <aside className="storefront-sidebar">
          <Brand size="sm" />

          <span className="storefront-shop-now" aria-hidden="true">
            <PlusIcon /> Shop Now
          </span>

          <nav className="storefront-sidenav">
            <div className="storefront-sidenav-section">
              <p className="storefront-sidenav-heading">Dashboard</p>
              <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
                <OrdersIcon /> <span>My Orders</span>
                {orderCount !== null && <span className="storefront-sidenav-count">{orderCount}</span>}
              </NavLink>
              <span aria-hidden="true">
                <TicketIcon /> <span>Coupons</span>
                {voucherCount !== null && <span className="storefront-sidenav-count">{voucherCount}</span>}
              </span>
              <span aria-hidden="true">
                <HeartIcon /> <span>Wishlist</span>
              </span>
            </div>

            <div className="storefront-sidenav-section">
              <p className="storefront-sidenav-heading">Category</p>
              <div className="storefront-tag-list" aria-hidden="true">
                {CATEGORY_TAGS.map(({ label, light, dark }) => (
                  <span
                    key={label}
                    className="storefront-tag"
                    style={{ '--tag-rgb-light': light, '--tag-rgb-dark': dark }}
                  >
                    <span className="storefront-tag-dot" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="storefront-sidenav-section storefront-sidenav-section--bottom">
              <NavLink to="/chat" className={({ isActive }) => (isActive ? 'active' : '')}>
                <ChatIcon /> <span>Support Chat</span>
              </NavLink>
              <span aria-hidden="true">
                <QuestionIcon /> <span>FAQ's</span>
              </span>
              <span aria-hidden="true">
                <SettingsIcon /> <span>Settings</span>
              </span>
              <span aria-hidden="true">
                <PersonIcon /> <span>Profile</span>
              </span>
            </div>
          </nav>

          {/* Profile chip moved down here from the old top bar - decorative
              (no account-menu backend behind the chevron), same as the
              reference's own bottom-of-sidebar user chip. */}
          <span className="storefront-profile-chip" aria-hidden="true">
            <span className="storefront-avatar">{initial}</span>
            <span className="storefront-profile-text">
              <span className="storefront-profile-email">{email}</span>
            </span>
            <ChevronDownIcon />
          </span>

          {/* Kept working, unlike the rest of this sidebar - with no other
              way to sign out, a decorative Logout would strand anyone
              verified with the "wrong" test account. */}
          <button type="button" className="storefront-logout" onClick={logout}>
            <LogoutIcon /> Logout
          </button>
        </aside>

        <main className="storefront-content">
          <div className="storefront-content-header">
            <div className="storefront-search" aria-hidden="true">
              <SearchIcon />
              <span>Search for products, orders...</span>
              <span className="storefront-search-kbd">⌘K</span>
            </div>
            <button
              type="button"
              className="storefront-icon-btn"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
          <Outlet />
        </main>

        {/* Real, working chat, not a copy of the reference's panel with no
            backend - only rendered off the /chat route itself, so there's
            never a second chat surface open next to the full ChatPage. */}
        {showAiPanel && <AiAssistantPanel />}
      </div>
    </div>
  );
}
