import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  EmptyOrdersIcon,
  SearchIcon,
  UndoIcon,
  XIcon,
} from '../components/icons.jsx';
import { computeOrderTotal } from '../utils/pricing.js';
import { downloadInvoice } from '../utils/invoice.js';

// The filter bar's own tabs - a real status each, unlike the old "On
// Shipping"/"Arrived" wording. "Shipped" still covers both shipped and
// out_for_delivery - this app has no separate tab for the latter.
// "Returned" has no matching value in this app's real `status` enum (see
// the CHECK constraint in migrations/1784973065584_initial-schema.sql) -
// kept in the list since it's part of the reference design being copied,
// but its count is always 0 and its filter always empty rather than
// matching it to some other status that isn't actually the same thing.
const STATUS_FILTERS = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'processing', label: 'Processing', statuses: ['processing'] },
  { key: 'shipped', label: 'Shipped', statuses: ['shipped', 'out_for_delivery'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { key: 'returned', label: 'Returned', statuses: [] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

// Orders still "in motion" - used only to pick this row's own action
// buttons/subtitle wording below, not to feature them anywhere special
// (there's no separate hero/timeline section on this page anymore - every
// order, regardless of status, is just a row in the one list below).
const IN_MOTION_STATUSES = ['processing', 'shipped', 'out_for_delivery'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const HISTORY_BADGE = {
  delivered: { label: 'Delivered', icon: CheckIcon, className: 'status-delivered' },
  returned: { label: 'Returned', icon: UndoIcon, className: 'status-returned' },
  cancelled: { label: 'Cancelled', icon: XIcon, className: 'status-cancelled' },
  // In-motion statuses reuse the same "where the order is" blue this app
  // already uses everywhere else that needs one (--color-active-surface/
  // -text) - no icon, since none of this file's existing glyphs mean "in
  // transit" and a borrowed one would be misleading.
  processing: { label: 'Processing', icon: null, className: 'status-active' },
  shipped: { label: 'Shipped', icon: null, className: 'status-active' },
  out_for_delivery: { label: 'Out for delivery', icon: null, className: 'status-active' },
};

// What each row's own subtitle date means per status - created_at is the
// only real timestamp this app has (no delivered_at/cancelled_at/
// returned_at column exists, see migrations/1784973065584_initial-
// schema.sql), so it doubles as an honest stand-in for "when this status
// happened," not a fabricated precise event time. In-motion orders have no
// such status-change event to report yet, so they get their order date
// instead.
function historySubtitle(order) {
  const when = dateFormatter.format(new Date(order.created_at));
  if (order.status === 'delivered') return `Delivered ${when}`;
  if (order.status === 'cancelled') return `Cancelled ${when}`;
  if (order.status === 'returned') return `Returned ${when}`;
  return `Ordered ${when}`;
}

// One collapsible row - expand state is owned locally, not lifted to a
// shared Set in OrdersPage, since "rows expand independently" is exactly
// what a plain per-row useState already gives for free; a shared
// Set(expandedOrderNumbers) would do the identical job with more code.
function OrderHistoryRow({ order }) {
  const [expanded, setExpanded] = useState(false);
  const badge = HISTORY_BADGE[order.status] ?? HISTORY_BADGE.delivered;
  const BadgeIcon = badge.icon;
  const total = computeOrderTotal(order);
  const detailId = `order-history-detail-${order.order_number}`;
  const isActive = IN_MOTION_STATUSES.includes(order.status);

  return (
    <li className={`order-history-row${order.status === 'cancelled' ? ' cancelled' : ''}${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="order-history-summary"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        <ProductImage icon={order.product_icon} size="xs" />
        <span className="order-history-info">
          <span className="order-history-title">{order.product_name}</span>
          <span className="order-history-meta">{historySubtitle(order)}</span>
        </span>
        <span className={`order-history-badge ${badge.className}`}>
          {BadgeIcon && <BadgeIcon />} {badge.label}
        </span>
        <ChevronDownIcon className="order-history-chevron" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="order-history-detail" id={detailId}>
          <div className="order-history-detail-field">
            <span>Order</span>
            <span>
              {order.order_number} · Qty: 1
            </span>
          </div>
          {order.status === 'delivered' && order.estimated_delivery && (
            <div className="order-history-detail-field">
              <span>Estimated arrival</span>
              <span>{dateFormatter.format(new Date(order.estimated_delivery))}</span>
            </div>
          )}
          <div className="order-history-detail-actions">
            <Link to={`/orders/${order.order_number}`} className="order-history-detail-btn">
              {isActive ? 'Track package' : 'View Details'}
            </Link>
            {total !== null && (
              <button type="button" className="order-history-detail-btn" onClick={() => downloadInvoice(order)}>
                <DownloadIcon /> Download Invoice
              </button>
            )}
            {!isActive && (
              <Link to="/shop" className="order-history-detail-btn buy-again">
                Buy again
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function OrdersPage() {
  const { email, logout } = useAuth();
  const { orders, nextCursor, loadingMore, error, loadMore, selectedCategories } = useOrders();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // The glide indicator behind the active filter tab - measured, not
  // hardcoded, since each tab's width varies with its own label length and
  // count digits (see .order-filter-tab). Recomputed whenever the active
  // tab or any tab's rendered width changes (counts arrive async after the
  // orders fetch resolves, which can widen/narrow a tab after first paint).
  // top/height are measured too, not just left/width - .order-filter-tabs
  // itself wraps onto multiple rows at narrow widths, and a CSS-only
  // height: calc(100% - 6px) assumes a single row, stretching the indicator
  // to cover every wrapped row at once instead of just the active tab's own
  // row.
  const tabRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, top: 0, height: 0 });
  const counts = {};
  for (const filter of STATUS_FILTERS) {
    counts[filter.key] = orders
      ? filter.statuses === null
        ? orders.length
        : orders.filter((o) => filter.statuses.includes(o.status)).length
      : 0;
  }

  const activeStatuses = STATUS_FILTERS.find((f) => f.key === activeFilter).statuses;
  const query = searchQuery.trim().toLowerCase();
  const historyOrders = orders
    ? orders
        .filter((o) => !activeStatuses || activeStatuses.includes(o.status))
        .filter((o) => selectedCategories.size === 0 || selectedCategories.has(o.product_icon))
        .filter((o) => !query || o.product_name.toLowerCase().includes(query) || o.order_number.toLowerCase().includes(query))
    : orders;

  useLayoutEffect(() => {
    function measure() {
      const activeTab = tabRefs.current[activeFilter];
      if (activeTab) {
        setIndicatorStyle({
          left: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
          top: activeTab.offsetTop,
          height: activeTab.offsetHeight,
        });
      }
    }
    measure();
    // Re-measure on resize too, not just when the active tab or its counts
    // change - which row (if any) the tabs wrap onto depends on the
    // viewport's own width, so the same active tab can land at a different
    // top/left purely from the window resizing, with nothing else about
    // the filters themselves changing.
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // counts.all is a stand-in for "any tab's count changed" - every count
    // recomputes together whenever `orders` resolves, so watching one is
    // enough to re-measure after their post-fetch width change.
  }, [activeFilter, counts.all]);

  return (
    <div className="orders-page-root">
      {/* The heading itself (and the decorative header-art flourish that
          used to sit next to it) is gone from here - Layout.jsx now owns
          "Your Orders" as part of the shared page-header row alongside the
          AI Assistant toggle (see Layout.jsx's PAGE_HEADERS). A real,
          static header now, not part of the scrollable content at all -
          .order-cards-scroll below only ever holds the order history list. */}
      <div className="orders-header">
        <div className="orders-filter-row">
          <nav className="order-filter-tabs" aria-label="Filter orders by status">
            <span
              className="order-filter-indicator"
              style={{
                transform: `translate(${indicatorStyle.left}px, ${indicatorStyle.top}px)`,
                width: `${indicatorStyle.width}px`,
                height: `${indicatorStyle.height}px`,
              }}
              aria-hidden="true"
            />
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                ref={(el) => (tabRefs.current[filter.key] = el)}
                className={`order-filter-tab${activeFilter === filter.key ? ' active' : ''}`}
                onClick={() => setActiveFilter(filter.key)}
                aria-pressed={activeFilter === filter.key}
              >
                {filter.label}{' '}
                {orders === null ? (
                  <span className="order-filter-count skeleton" aria-hidden="true" />
                ) : (
                  <span className="order-filter-count fade-in">{counts[filter.key]}</span>
                )}
              </button>
            ))}
          </nav>

          {/* A real, working filter - narrows the order history list below
              by product name or order number, entirely client-side against
              data this page already has in memory. */}
          <div className="storefront-search">
            <SearchIcon aria-hidden="true" />
            <label htmlFor="orders-search-input" className="sr-only">
              Search order history by product name or order number
            </label>
            <input
              id="orders-search-input"
              type="text"
              placeholder="Search for products, orders..."
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="storefront-search-kbd" aria-hidden="true">⌘K</span>
          </div>
        </div>
      </div>

      <div className="order-cards-scroll slim-scroll" aria-live="polite">
        {error && (
          <p className="verify-error" role="alert">
            {error}
          </p>
        )}
        {!error && orders === null && (
          <>
            <p className="sr-only">Loading your orders…</p>
            <h2 className="section-heading">Updated order history</h2>
            <ul className="order-history-list" aria-hidden="true">
              <li className="order-history-row order-history-row-skeleton">
                <span className="skeleton order-history-skeleton-thumb" />
                <span className="skeleton order-history-skeleton-line" />
                <span className="skeleton order-history-skeleton-pill" />
              </li>
            </ul>
          </>
        )}
        {/* A real, expected state now, not just a theoretical edge case -
            any email that verifies via OTP lands here, whether or not it's
            ever actually placed an order (see README > Auth), so this
            explains why rather than just saying "not found." "Try a
            different email" just signs out - ProtectedRoute already sends a
            signed-out visitor to /verify, so there's no separate redirect
            to wire up here. */}
        {orders && orders.length === 0 && (
          <div className="orders-empty-state fade-in">
            <EmptyOrdersIcon className="orders-empty-icon" aria-hidden="true" />
            <p className="orders-empty-title">No orders found for this email</p>
            <p className="orders-empty-text">
              {email} isn't linked to any orders yet. If you used a different email at checkout, try that one instead.
            </p>
            <div className="orders-empty-actions">
              <button type="button" className="orders-empty-primary" onClick={logout}>
                Try a different email
              </button>
              <Link to="/chat" className="orders-empty-secondary">
                Contact support
              </Link>
            </div>
          </div>
        )}

        {orders && orders.length > 0 && (
          <>
            <h2 className="section-heading">Updated order history</h2>

            {historyOrders.length === 0 ? (
              <p className="subtitle fade-in">No orders in this category.</p>
            ) : (
              <ul className="order-history-list fade-in">
                {historyOrders.map((order) => (
                  <OrderHistoryRow key={order.order_number} order={order} />
                ))}
              </ul>
            )}

            {nextCursor && (
              <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
