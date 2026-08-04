import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { OrdersProvider, useOrders } from '../context/OrdersContext.jsx';
import { Brand } from './Brand.jsx';
import { AiAssistantPanel } from './AiAssistantPanel.jsx';
import { CategoryBadgesEditor } from './CategoryBadgesEditor.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import { CardIcon, ChatIcon, HeartIcon, OrdersIcon, PersonIcon, PinIcon, PlusIcon, ShopIcon, SparkleIcon, TicketIcon } from './icons.jsx';

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
  '/coupons': { icon: TicketIcon, title: 'Coupons', docTitle: 'Coupons' },
  '/wishlist': { icon: HeartIcon, title: 'Wishlist', docTitle: 'Wishlist' },
  '/shop': { icon: ShopIcon, title: 'Shop', docTitle: 'Shop' },
  '/profile': { icon: PersonIcon, title: 'Profile', docTitle: 'Profile' },
  '/address': { icon: PinIcon, title: 'Address', docTitle: 'Address' },
  '/payment': { icon: CardIcon, title: 'Payment Methods', docTitle: 'Payment Methods' },
};

function getPageHeader(pathname, params) {
  if (params.orderNumber) return { icon: OrdersIcon, title: params.orderNumber, docTitle: params.orderNumber };
  return PAGE_HEADERS[pathname] || { icon: null, title: '', docTitle: '' };
}

// Row height (32px, see .storefront-sidenav-item in index.css) + the
// section's own 3px row gap - kept as one JS constant instead of measuring
// the DOM, since every Dashboard row shares the exact same fixed height and
// this is the one number the sliding indicator (.storefront-sidenav-
// indicator) needs to glide to the right row.
const NAV_ROW_STEP = 35;
// All three Dashboard rows are real routes now (My Orders/Coupons/Wishlist
// - Coupons and Wishlist land on ComingSoonPage rather than a built-out
// feature, but that's still a real page, not a fake local-only highlight).
// The indicator's position is derived straight from the URL, same as any
// other active-nav-link styling - -1 means "none of these three match",
// which hides the indicator (see its own style below) instead of leaving
// it parked under whichever row was last real.
function getDashboardNavIndex(pathname) {
  if (pathname.startsWith('/orders')) return 0;
  if (pathname.startsWith('/coupons')) return 1;
  if (pathname.startsWith('/wishlist')) return 2;
  return -1;
}

// The (still decorative - see OrdersPage.jsx's own comment on it) search
// bar moved to the Orders page itself, next to its filter tabs, so this
// shared header no longer renders it - only the AI Assistant toggle lives
// here now, the single control that opens/closes the AI drawer (see
// AiAssistantPanel.jsx). Everything else in the sidebar below is real: the
// account menu (ProfileMenu.jsx) has working theme/sign-out controls, and
// Shop Now/Coupons/Wishlist/Address/Payment Methods are real NavLinks to
// real routes (see App.jsx), same as My Orders - they just land on
// ComingSoonPage instead of a built-out feature, an honest "not built yet"
// rather than a link that silently does nothing. My Orders' and Coupons'
// counts are real numbers derived from the signed-in customer's own
// orders, not placeholders - Wishlist has no backing data at all, so it
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
  const { orders } = useOrders();
  const location = useLocation();
  const params = useParams();
  const orderCount = orders ? orders.length : null;
  const voucherCount = orders ? orders.filter((o) => o.voucher_cents > 0).length : null;

  const showAiPanel = location.pathname !== '/chat';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Open by default, matching how the AI panel always used to just be
  // there - the toggle in the header (below) is a way to dismiss it, not
  // an opt-in a returning visitor has to rediscover every time.
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const navIndex = getDashboardNavIndex(location.pathname);

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
          the sidebar below, and the (decorative) search bar lives in the
          main content card's own header instead, same as the reference
          this shell is modeled on. */}
      <div className="storefront-body">
        <aside className={`storefront-sidebar${sidebarCollapsed ? ' storefront-sidebar--collapsed' : ''}`}>
          <div className="storefront-sidebar-head">
            {/* The brand itself is the toggle now - no separate chevron
                button. Clicking the logo/wordmark is the only way to
                minimize/expand the sidebar. */}
            <button
              type="button"
              className="storefront-brand-button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={sidebarCollapsed}
            >
              <Brand size="sm" showLabel={!sidebarCollapsed} />
            </button>
          </div>

          {/* A real route now (see App.jsx's /shop), not a decorative span -
              lands on the same honest ComingSoonPage as Coupons/Wishlist. */}
          <NavLink to="/shop" className="storefront-shop-now">
            <PlusIcon /> <span>Shop Now</span>
          </NavLink>

          <nav className="storefront-sidenav">
            <p className="storefront-sidenav-heading">Dashboard</p>
            <div className="storefront-sidenav-section">
              <span
                className="storefront-sidenav-indicator"
                style={{
                  transform: `translateY(${Math.max(navIndex, 0) * NAV_ROW_STEP}px)`,
                  opacity: navIndex === -1 ? 0 : 1,
                }}
                aria-hidden="true"
              />
              <NavLink to="/orders" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                <span className="storefront-sidenav-icon-wrap">
                  <OrdersIcon />
                  {/* Collapsed-only stand-in for the count pill below, which
                      the collapsed rail hides along with every other label -
                      a small badge overlaid on the icon itself keeps the
                      count visible even with no room for a full row. Hidden
                      once loaded at 0, same as the full pill below - see
                      that span's own comment for why. */}
                  {orderCount === null ? (
                    <span className="storefront-sidenav-badge skeleton" aria-hidden="true" />
                  ) : (
                    orderCount > 0 && <span className="storefront-sidenav-badge" aria-hidden="true">{orderCount}</span>
                  )}
                </span>
                <span>My Orders</span>
                {/* Hidden once loaded at 0, not just while loading - a real
                    zero is still worth omitting here (there's nothing to
                    draw the eye to), the same call this app already makes
                    for e.g. the Category badges editor's own empty "Active
                    Badges (0)" state not needing a pill of its own. */}
                {orderCount === null ? (
                  <span className="storefront-sidenav-count skeleton" aria-hidden="true" />
                ) : (
                  orderCount > 0 && <span className="storefront-sidenav-count fade-in">{orderCount}</span>
                )}
              </NavLink>
              <NavLink to="/coupons" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                <span className="storefront-sidenav-icon-wrap">
                  <TicketIcon />
                  {voucherCount === null ? (
                    <span className="storefront-sidenav-badge skeleton" aria-hidden="true" />
                  ) : (
                    voucherCount > 0 && <span className="storefront-sidenav-badge" aria-hidden="true">{voucherCount}</span>
                  )}
                </span>
                <span>Coupons</span>
                {voucherCount === null ? (
                  <span className="storefront-sidenav-count skeleton" aria-hidden="true" />
                ) : (
                  voucherCount > 0 && <span className="storefront-sidenav-count fade-in">{voucherCount}</span>
                )}
              </NavLink>
              <NavLink to="/wishlist" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                <HeartIcon /> <span>Wishlist</span>
              </NavLink>
            </div>

            <CategoryBadgesEditor />
          </nav>

          {/* Real account menu (avatar, email, theme, Help & Support, Sign
              Out) - see ProfileMenu.jsx. Replaces the old decorative chip +
              separate always-visible Logout button below it. */}
          <ProfileMenu />
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
              {/* Theme control moved into ProfileMenu's theme trio - this
                  row no longer needs its own toggle. The single control
                  for the AI drawer below - its own header stopped being
                  clickable once this became the one way to open/close it
                  (see AiAssistantPanel.jsx). Only rendered alongside the
                  drawer itself (see showAiPanel above) - a button that
                  toggled a panel that isn't even mounted on /chat would be
                  broken, not just redundant. */}
              {showAiPanel && (
                <button
                  type="button"
                  className={`ai-toggle${aiPanelOpen ? ' on' : ''}`}
                  onClick={() => setAiPanelOpen((o) => !o)}
                  aria-pressed={aiPanelOpen}
                  aria-label={aiPanelOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
                >
                  <SparkleIcon width="15" height="15" />
                </button>
              )}
            </div>
          </div>
          <div className="page-body">
            <Outlet />
          </div>
        </main>

        {/* Real, working chat, not a copy of the reference's panel with no
            backend - only rendered off the /chat route itself, so there's
            never a second chat surface open next to the full ChatPage. */}
        {showAiPanel && <AiAssistantPanel isOpen={aiPanelOpen} />}
      </div>
    </div>
  );
}
