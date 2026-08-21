import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { OrdersProvider, useOrders } from '../context/OrdersContext.jsx';
import { CartProvider, useCart } from '../context/CartContext.jsx';
import { ProductsProvider, useProducts } from '../context/ProductsContext.jsx';
import { Brand } from './Brand.jsx';
import { AiAssistantPanel } from './AiAssistantPanel.jsx';
import { CategoryBadgesEditor } from './CategoryBadgesEditor.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';
import { CardIcon, CartIcon, ChatIcon, HeartIcon, OrdersIcon, PanelLeftIcon, PinIcon, PlusIcon, ShopIcon, SparkleIcon, TicketIcon } from './icons.jsx';

const PAGE_HEADERS = {
  '/orders': { icon: OrdersIcon, title: 'Your Orders', docTitle: 'Your Orders' },
  '/chat': { icon: ChatIcon, title: 'Order Support Assistant', docTitle: 'Chat' },
  '/coupons': { icon: TicketIcon, title: 'Coupons', docTitle: 'Coupons' },
  '/wishlist': { icon: HeartIcon, title: 'Wishlist', docTitle: 'Wishlist' },
  '/shop': { icon: ShopIcon, title: 'Shop', docTitle: 'Shop' },
  '/address': { icon: PinIcon, title: 'Address', docTitle: 'Address' },
  '/payment': { icon: CardIcon, title: 'Payment Methods', docTitle: 'Payment Methods' },
  '/bag': { icon: CartIcon, title: 'Shopping Bag', docTitle: 'Shopping Bag' },
  '/checkout': { icon: CartIcon, title: 'Checkout', docTitle: 'Checkout' },
};

function getPageHeader(pathname, params, product) {
  if (params.orderNumber) return { icon: OrdersIcon, title: params.orderNumber, docTitle: params.orderNumber };
  if (params.productId) {
    const title = product?.name ?? 'Product';
    return { icon: ShopIcon, title, docTitle: title };
  }
  return PAGE_HEADERS[pathname] || { icon: null, title: '', docTitle: '' };
}

// Row height (32px, see .storefront-sidenav-item in index.css) + the
// section's own 3px row gap - kept as one JS constant instead of measuring

const NAV_ROW_STEP = 35;

function getDashboardNavIndex(pathname) {
  if (pathname.startsWith('/bag')) return 0;
  if (pathname.startsWith('/orders')) return 1;
  if (pathname.startsWith('/coupons')) return 2;
  if (pathname.startsWith('/wishlist')) return 3;
  return -1;
}

export function Layout() {
  return (
    <OrdersProvider>
      <CartProvider>
        <ProductsProvider>
          <LayoutInner />
        </ProductsProvider>
      </CartProvider>
    </OrdersProvider>
  );
}

function LayoutInner() {
  const { orders } = useOrders();
  const { items: cartItems } = useCart();
  const { findProduct } = useProducts();
  const cartCount = cartItems.length;
  const location = useLocation();
  const params = useParams();
  const orderCount = orders ? orders.length : null;
  const voucherCount = orders ? orders.filter((o) => o.voucher_cents > 0).length : null;

  const showAiPanel = location.pathname !== '/chat';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const navIndex = getDashboardNavIndex(location.pathname);

  const { icon: PageIcon, title: pageTitle, docTitle } = getPageHeader(location.pathname, params, findProduct(params.productId));
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [location.pathname]);
  useEffect(() => {
    document.title = docTitle ? `${docTitle} · Order Support Assistant` : 'Order Support Assistant';
  }, [docTitle]);

  return (
    <div className="storefront-shell">
      {}
      <div className="storefront-body">
        <aside className={`storefront-sidebar${sidebarCollapsed ? ' storefront-sidebar--collapsed' : ''}`}>
          {}
          <div className="storefront-sidebar-clip">
            <div className="storefront-sidebar-head">
              {}
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

            {}
            <NavLink to="/shop" className="storefront-shop-now">
              <PlusIcon /> <span className="storefront-sidenav-label">Shop Now</span>
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
                <NavLink to="/bag" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                  <span className="storefront-sidenav-icon-wrap">
                    <CartIcon />
                    {cartCount > 0 && <span className="storefront-sidenav-badge" aria-hidden="true">{cartCount}</span>}
                  </span>
                  <span className="storefront-sidenav-label">Cart</span>
                  {cartCount > 0 && <span className="storefront-sidenav-count fade-in">{cartCount}</span>}
                </NavLink>
                <NavLink to="/orders" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                  <span className="storefront-sidenav-icon-wrap">
                    <OrdersIcon />
                    {}
                    {orderCount === null ? (
                      <span className="storefront-sidenav-badge skeleton" aria-hidden="true" />
                    ) : (
                      orderCount > 0 && <span className="storefront-sidenav-badge" aria-hidden="true">{orderCount}</span>
                    )}
                  </span>
                  <span className="storefront-sidenav-label">My Orders</span>
                  {}
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
                  <span className="storefront-sidenav-label">Coupons</span>
                  {voucherCount === null ? (
                    <span className="storefront-sidenav-count skeleton" aria-hidden="true" />
                  ) : (
                    voucherCount > 0 && <span className="storefront-sidenav-count fade-in">{voucherCount}</span>
                  )}
                </NavLink>
                <NavLink to="/wishlist" className={({ isActive }) => `storefront-sidenav-item${isActive ? ' active' : ''}`}>
                  <HeartIcon /> <span className="storefront-sidenav-label">Wishlist</span>
                </NavLink>
              </div>

              <CategoryBadgesEditor />
            </nav>
          </div>

          {}
          <ProfileMenu />
        </aside>

        {}
        <main className={`storefront-content${!showAiPanel || !aiPanelOpen ? ' ai-panel-collapsed' : ''}`}>
          <div className="page-header">
            <div className="page-header-title">
              {}
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setSidebarCollapsed((c) => !c)}
                aria-pressed={sidebarCollapsed}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <PanelLeftIcon open={!sidebarCollapsed} />
              </button>
              {PageIcon && <PageIcon aria-hidden="true" />}
              <h1 ref={headingRef} tabIndex={-1}>
                {pageTitle}
              </h1>
            </div>
            <div className="page-header-actions">
              {}
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

        {}
        {showAiPanel && <AiAssistantPanel isOpen={aiPanelOpen} />}
      </div>
    </div>
  );
}
