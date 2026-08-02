import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { CheckIcon, ChevronDownIcon, DownloadIcon, EmptyOrdersIcon, SearchIcon, UndoIcon, XIcon } from '../components/icons.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

// "Returned" has no matching value in this app's real `status` enum (see
// the CHECK constraint in migrations/1784973065584_initial-schema.sql) -
// kept in the list since it's part of the reference design being copied,
// but its count is always 0 and its filter always empty rather than
// matching it to some other status that isn't actually the same thing.
const STATUS_FILTERS = [
  { key: 'all', label: 'All Orders', statuses: null },
  { key: 'shipping', label: 'On Shipping', statuses: ['shipped', 'out_for_delivery'] },
  { key: 'arrived', label: 'Arrived', statuses: ['delivered'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { key: 'returned', label: 'Returned', statuses: [] },
];

// The statuses Needs Attention features - anything still "in motion".
// Everything else (Delivered/Cancelled/Returned) is done moving and lives
// in the order history list below instead.
const IN_MOTION_STATUSES = ['processing', 'shipped', 'out_for_delivery'];

// The four forward-progression statuses this app actually has, each with
// the headline/subtext an order card shows for it - cancelled is handled
// separately in OrderProgress below since it's a branch-off, not a further
// step in this sequence.
const STATUS_STEPS = [
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

// The Needs Attention section (and the order history list, for the same
// reason) needs the customer's *entire* order history, not just the
// shared OrdersContext's one manually-paginated page at a time (see that
// context's own comment) - both would silently miss orders past the first
// page otherwise. MAX_PAGE_SIZE server-side is 100 (see
// src/services/orderService.js) - comfortably above what any real
// customer of this app has - so this almost always resolves in a single
// request; the cursor loop only matters for the rare account that somehow
// exceeds that.
function useOrderHistory() {
  const authorizedFetch = useAuthorizedFetch();
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        let all = [];
        let cursor = null;
        do {
          const url = cursor
            ? `/api/orders?limit=100&cursor=${encodeURIComponent(cursor)}`
            : '/api/orders?limit=100';
          const res = await authorizedFetch(url);
          if (res.status === 401 || !res.ok) return;
          const data = await res.json();
          all = all.concat(data.orders);
          cursor = data.nextCursor;
        } while (cursor);
        if (!cancelled) setHistory(all);
      } catch {
        // Needs Attention/order history are supplementary widgets, not
        // critical path - if this fetch fails, they just don't render
        // rather than surfacing a second error banner next to the real
        // one OrdersContext already owns.
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  return history;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// A real, working download built entirely from data this app already has
// (unit_price_cents/delivery_cost_cents/vat_cents/voucher_cents all exist
// per order - see migrations/1785095226496_add-order-pricing-and-product-
// icon.sql) - a plain text receipt via a client-side Blob, not a PDF
// service or a second backend endpoint, since nothing here needs one.
function downloadInvoice(order) {
  const total = computeOrderTotal(order);
  if (total === null) return;

  const lines = [
    'Order Support Assistant — Invoice',
    '',
    `Order: ${order.order_number}`,
    `Product: ${order.product_name}`,
    `Date: ${dateFormatter.format(new Date(order.created_at))}`,
    '',
    `Original price: ${formatCents(order.unit_price_cents)}`,
    `Delivery: ${order.delivery_cost_cents ? formatCents(order.delivery_cost_cents) : 'Free'}`,
    `VAT: ${formatCents(order.vat_cents || 0)}`,
  ];
  if (order.voucher_cents > 0) {
    lines.push(`Voucher${order.voucher_code ? ` (${order.voucher_code})` : ''}: -${formatCents(order.voucher_cents)}`);
  }
  lines.push(`Total: ${formatCents(total)}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${order.order_number}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Content-shaped placeholder (image tile/title/meta/status pill/progress
// bar, matching .order-card's own layout) instead of a plain "Loading..."
// line - previews the real layout so the page doesn't visually jump once
// data arrives, and reads as "orders are coming" rather than just "wait".
function NeedsAttentionSkeleton() {
  return (
    <li className="order-card order-card-skeleton" aria-hidden="true">
      <div className="order-card-top">
        <span className="skeleton order-card-skeleton-image" />
        <div className="order-card-info">
          <span className="skeleton order-card-skeleton-line order-card-skeleton-line--title" />
          <span className="skeleton order-card-skeleton-line order-card-skeleton-line--meta" />
          <span className="skeleton order-card-skeleton-pill" />
        </div>
      </div>
      <span className="skeleton order-card-skeleton-progress" />
    </li>
  );
}

function OrderProgress({ status }) {
  if (status === 'cancelled') {
    return <p className="order-progress-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="order-progress" aria-label={`Order progress: ${status.replace(/_/g, ' ')}`}>
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`order-progress-step${i <= currentIndex ? ' completed' : ''}${
            i === currentIndex ? ' current' : ''
          }`}
          // --step-i drives index.css's staggered fill-line/icon-pop
          // animation delays - set on the <li> (not the icon span) since
          // the connecting line is that same element's own ::after, and a
          // custom property set on a child span wouldn't be visible to its
          // parent's pseudo-element. Descendants (the icon span below)
          // still see it via normal inheritance either way.
          style={{ '--step-i': i }}
        >
          {/* One shared glyph per state, not one glyph per step - a step
              that hasn't been reached yet gets an empty ring, never a
              checkmark, regardless of which step it is. */}
          <span
            className={`order-progress-icon ${i < currentIndex ? 'icon-check' : i === currentIndex ? 'icon-dot' : 'icon-ring'}`}
            aria-hidden="true"
          >
            {i < currentIndex && <CheckIcon />}
          </span>
          <span className="order-progress-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

// The page's own hero section - every order still in motion, each with its
// real tracking progress, not just the single most-recent one the old
// Active Order Spotlight featured. Delivered/Cancelled/Returned orders
// never appear here regardless of how recent they are - "needs attention"
// means something is still happening, not that something happened lately
// (see the order history list below for those). Renders nothing at all
// when there's nothing in motion, rather than a fabricated "all caught up"
// placeholder the brief didn't ask for.
// selectedCategories (the sidebar's own chips) still narrows this section -
// "only show me these kinds of products" is a standing preference for the
// whole page, not a way to browse a specific slice of history, unlike the
// status tabs/search bar just below (which the brief explicitly scoped to
// the order history list only, see OrdersPage's own historyOrders filter).
function NeedsAttentionSection({ selectedCategories }) {
  const history = useOrderHistory();

  if (history === null) {
    return (
      <section aria-hidden="true">
        <h2 className="section-heading">Needs attention</h2>
        <ul className="order-cards needs-attention-cards">
          <NeedsAttentionSkeleton />
        </ul>
      </section>
    );
  }

  // Sorted created_at DESC by the API itself (see useOrderHistory's own
  // comment), so this reads newest-in-motion-order first.
  const activeOrders = history
    .filter((o) => IN_MOTION_STATUSES.includes(o.status))
    .filter((o) => selectedCategories.size === 0 || selectedCategories.has(o.product_icon));
  if (activeOrders.length === 0) return null;

  return (
    <section>
      <h2 className="section-heading">Needs attention</h2>
      <ul className="order-cards needs-attention-cards fade-in">
        {activeOrders.map((order) => {
          const currentIndex = STATUS_STEPS.findIndex((step) => step.key === order.status);
          return (
            <li key={order.order_number} className="order-card">
              <Link to={`/orders/${order.order_number}`} className="order-card-details-link">
                Track package
              </Link>
              <div className="order-card-top">
                <ProductImage icon={order.product_icon} size="lg" />
                <div className="order-card-info">
                  <p className="order-card-product">{order.product_name}</p>
                  <p className="order-card-meta">
                    <span className="order-card-id">{order.order_number}</span>
                    <span aria-hidden="true">&bull;</span>
                    <span>Qty: 1</span>
                  </p>
                  <span className={`order-status status-${order.status}`}>
                    {STATUS_STEPS[currentIndex]?.label ?? order.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <OrderProgress status={order.status} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HISTORY_BADGE = {
  delivered: { label: 'Delivered', icon: CheckIcon, className: 'status-delivered' },
  returned: { label: 'Returned', icon: UndoIcon, className: 'status-returned' },
  cancelled: { label: 'Cancelled', icon: XIcon, className: 'status-cancelled' },
};

// What each row's own subtitle date means per status - created_at is the
// only real timestamp this app has (no delivered_at/cancelled_at/
// returned_at column exists, see migrations/1784973065584_initial-
// schema.sql), so it doubles as an honest stand-in for "when this
// status happened" the same way the old Active Order Spotlight's own
// "Delivered" state already did, not a fabricated precise event time.
function historySubtitle(order) {
  const when = dateFormatter.format(new Date(order.created_at));
  if (order.status === 'delivered') return `Delivered ${when}`;
  if (order.status === 'cancelled') return `Cancelled ${when}`;
  return `Returned ${when}`;
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

  return (
    <li className={`order-history-row${order.status === 'cancelled' ? ' cancelled' : ''}`}>
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
          <BadgeIcon /> {badge.label}
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
              View Details
            </Link>
            {total !== null && (
              <button type="button" className="order-history-detail-btn" onClick={() => downloadInvoice(order)}>
                <DownloadIcon /> Download Invoice
              </button>
            )}
            <Link to="/shop" className="order-history-detail-btn">
              Buy again
            </Link>
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
  // itself wraps onto multiple rows at narrow widths (five tabs sharing the
  // filter row with the search bar - see .orders-filter-row), and a CSS-only
  // height: calc(100% - 6px) assumes a single row, stretching the indicator
  // to cover every wrapped row at once instead of just the active tab's own
  // row. Found live on a Mobile Chrome screenshot, not by reasoning about
  // flex-wrap in the abstract - the indicator rendered as a tall blob
  // covering three rows of tabs.
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
  // Order history only ever holds orders that are done moving - the status
  // tabs/category chips/search all narrow *within* that fixed scope, they
  // don't widen it back out. Selecting "On Shipping" here correctly shows
  // an empty history list (those orders live in Needs Attention instead,
  // always shown regardless of this filter) rather than duplicating them
  // into both places at once.
  const query = searchQuery.trim().toLowerCase();
  const historyOrders = orders
    ? orders
        .filter((o) => !IN_MOTION_STATUSES.includes(o.status))
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
          AI Assistant toggle (see Layout.jsx's PAGE_HEADERS).
          A real, static header now, not part of the scrollable content at
          all - .order-cards-scroll below only ever holds the cards
          themselves. See .orders-header's own comment in index.css for
          why (a plain border + shadow now, not the sticky/blurred
          treatment tried here first). */}
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

          {/* A real, working filter now (not the decorative placeholder
              this page's own header used to carry) - narrows the order
              history list below by product name or order number, entirely
              client-side against data this page already has in memory. */}
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
        <NeedsAttentionSection selectedCategories={selectedCategories} />

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
