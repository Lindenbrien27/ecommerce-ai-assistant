import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
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
  PlusIcon,
  SearchIcon,
  SunIcon,
  TicketIcon,
} from './icons.jsx';

// The routed page's own title/icon, keyed by path - not each page rendering
// its own <h1> anymore. The header row now needs the title on the same
// line as the search bar/theme toggle (see .page-header), which live here
// in Layout, not in any one page - centralizing both in the one component
// that's actually common to every route was simpler and more reliable than
// threading each page's heading into a shared slot (a page-owned <h1> with
// its own focus-on-mount ref would be focused before the shared header
// slot even had a render tick to pick it up - a real race, not a
// theoretical one). :orderNumber's title comes from useParams() below
// instead of a static entry here, since it's the one route without a
// fixed title.
// docTitle is deliberately its own field, not just reused from title - the
// browser tab for /chat previously said "Chat · Order Support Assistant",
// not "Order Support Assistant · Order Support Assistant", since this
// app's own name (the document-title suffix, see the effect below) already
// says "Order Support Assistant" once; the on-page heading and the tab
// title are allowed to differ, and here they deliberately do.
const PAGE_HEADERS = {
  '/orders': { icon: OrdersIcon, title: 'Your Orders', docTitle: 'Your Orders' },
  '/chat': { icon: ChatIcon, title: 'Order Support Assistant', docTitle: 'Chat' },
};

function getPageHeader(pathname, params) {
  if (params.orderNumber) return { icon: OrdersIcon, title: params.orderNumber, docTitle: params.orderNumber };
  return PAGE_HEADERS[pathname] || { icon: null, title: '', docTitle: '' };
}

// Real multi-select filter chips now, not decorative labels - `icon` is
// the order's own product_icon value (see PRODUCT_ICONS in icons.jsx),
// which is what actually gets filtered on; `label` is just the chip's
// display text. Matches this app's own 5 real products rather than the
// clothing categories ("tshirt, pants") in the reference screenshot this
// section is modeled on - this store doesn't sell clothes, and labeling a
// filter with categories that don't match anything in the real catalog
// would be a worse copy of the reference than adapting it to what's
// actually here.
const CATEGORY_TAGS = [
  { label: 'Audio', icon: 'headphones' },
  { label: 'Cables', icon: 'cable' },
  { label: 'Peripherals', icon: 'keyboard' },
  { label: 'Furniture', icon: 'chair' },
  { label: 'Displays', icon: 'monitor' },
];

// Most of this sidebar/content-header is intentionally inert - plain
// <span>s, not <button>s, copying a reference design's structure. This app
// has no coupon/wishlist-editing/global-search backend for those items to
// actually do something - a non-interactive element styled to look
// clickable is more honest than a real control with no real behavior. My
// Orders, Category (now a real multi-select filter, not just decoration),
// Logout, the theme toggle, and the AI Assistant panel are the ones that
// stay functional. My Orders' and Coupons' counts are real numbers derived
// from the signed-in customer's own orders, not placeholders - Wishlist
// has no backing data at all, so it gets no number rather than a
// fabricated one.
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
  const { orders, selectedCategories, toggleCategory } = useOrders();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const params = useParams();
  const initial = email ? email[0].toUpperCase() : '?';
  const orderCount = orders ? orders.length : null;
  const voucherCount = orders ? orders.filter((o) => o.voucher_cents > 0).length : null;

  const showAiPanel = location.pathname !== '/chat';

  const { icon: PageIcon, title: pageTitle, docTitle } = getPageHeader(location.pathname, params);
  const headingRef = useRef(null);

  // Same two jobs useFocusOnMount/useDocumentTitle used to do per-page, now
  // done once here since the heading itself lives here now. Keyed on
  // pathname (not on pageTitle) so a param change under the same route
  // (e.g. one order to another, if that ever becomes a link rather than a
  // full navigation) still moves focus - matching the old per-page
  // behavior, where every route entry was a fresh mount.
  useEffect(() => {
    headingRef.current?.focus();
  }, [location.pathname]);
  useEffect(() => {
    document.title = docTitle ? `${docTitle} · Order Support Assistant` : 'Order Support Assistant';
  }, [docTitle]);

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
            <p className="storefront-sidenav-heading">Dashboard</p>
            <div className="storefront-sidenav-section">
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

            <p className="storefront-sidenav-heading">Category</p>
            <div className="storefront-tag-list" role="group" aria-label="Filter orders by category">
              {CATEGORY_TAGS.map(({ label, icon }) => (
                <button
                  key={label}
                  type="button"
                  className="storefront-tag"
                  aria-pressed={selectedCategories.has(icon)}
                  onClick={() => toggleCategory(icon)}
                >
                  {label}
                </button>
              ))}
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
          <div className="page-header">
            <div className="page-header-title">
              {PageIcon && <PageIcon aria-hidden="true" />}
              <h1 ref={headingRef} tabIndex={-1}>
                {pageTitle}
              </h1>
            </div>
            <div className="page-header-actions">
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
