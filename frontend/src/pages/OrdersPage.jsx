import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { CheckIcon, ChevronDownIcon, DownloadIcon, EmptyOrdersIcon, SearchIcon } from '../components/icons.jsx';
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
const STATUS_MESSAGES = {
  processing: { headline: 'Your order is being processed', text: 'We are preparing your order for shipment.' },
  shipped: { headline: 'Your order has shipped', text: 'Your package is on its way to the carrier facility.' },
  out_for_delivery: { headline: 'Out for delivery', text: 'Your order is on the way to you.' },
  delivered: { headline: 'Delivered', text: 'Your order has been delivered.' },
};

// The Active Order Spotlight needs the customer's *entire* order history
// (to reliably find "the most recent active order" and "the most recent
// delivered order" even if either happens to sit past the first
// paginated page) - the shared OrdersContext used by the visible card
// list deliberately only holds one manually-paginated page at a time (see
// its own comment), which is the right call for a list a person scrolls/
// loads more of, but would silently miss this widget's own answer once
// someone has more than one page of history. MAX_PAGE_SIZE server-side is
// 100 (see src/services/orderService.js) - comfortably above what any
// real customer of this app has - so this almost always resolves in a
// single request; the cursor loop only matters at all for the rare
// account that somehow exceeds that.
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
        // The Active Order Spotlight is a supplementary widget, not
        // critical path - if its own fetch fails, it just doesn't render
        // (see the null check in ActiveOrderSpotlight below) rather than
        // surfacing a second error banner next to the real one
        // OrdersContext already owns.
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  return history;
}

const spotlightDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
// The one thing this widget can't honestly claim: no delivered_at
// timestamp exists anywhere in this app's data (only created_at, the
// order-*placement* time - see migrations/1784973065584_initial-schema.sql
// and .../1785095226496_add-order-pricing-and-product-icon.sql), so
// "recently delivered" is approximated as "created within the last two
// weeks" rather than a real delivery-time window. Good enough to decide
// whether to feature a delivered order here at all; not precise enough to
// ever print an exact delivered-at time (see the Delivered state below,
// which shows a date only).
const RECENT_DELIVERY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// A real, working download built entirely from data this app already has
// (unit_price_cents/delivery_cost_cents/vat_cents/voucher_cents all exist
// per order - see the same migration referenced above) - a plain text
// receipt via a client-side Blob, not a PDF service or a second backend
// endpoint, since nothing here needs one.
function downloadInvoice(order) {
  const total = computeOrderTotal(order);
  if (total === null) return;

  const lines = [
    'Order Support Assistant — Invoice',
    '',
    `Order: ${order.order_number}`,
    `Product: ${order.product_name}`,
    `Date: ${spotlightDateFormatter.format(new Date(order.created_at))}`,
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

// The signature element above the filter tabs - not a decorative chart,
// the one order that's actually relevant right now. Three honest states,
// checked in priority order against the customer's real order history:
// something's in progress (show it, with real tracking progress) > the
// most recent delivery was recent enough to still be worth surfacing
// (show it, with the two actions this app can genuinely back - View
// Details and a real invoice download) > neither (a quiet confirmation,
// not a fabricated "nothing to see" when there might be an old delivery
// that just isn't recent anymore).
function ActiveOrderSpotlight() {
  const orders = useOrderHistory();

  if (orders === null) {
    return (
      <section className="spotlight" aria-hidden="true">
        <span className="skeleton spotlight-skeleton" />
      </section>
    );
  }
  if (orders.length === 0) return null;

  // Sorted created_at DESC by the API itself (see useOrderHistory's own
  // comment) - .find() below always returns the *most recent* order
  // matching each condition, not just any matching one.
  const activeOrder = orders.find((o) => ['processing', 'shipped', 'out_for_delivery'].includes(o.status));

  if (activeOrder) {
    const currentIndex = STATUS_STEPS.findIndex((step) => step.key === activeOrder.status);
    const label = STATUS_STEPS[currentIndex]?.label ?? activeOrder.status;
    return (
      <section className="spotlight is-linked fade-in">
        <ProductImage icon={activeOrder.product_icon} size="md" />
        <div className="spotlight-body">
          <span className={`spotlight-eyebrow status-${activeOrder.status}`}>{label}</span>
          <p className="spotlight-title">{activeOrder.product_name}</p>
          <p className="spotlight-meta">
            {activeOrder.order_number}
            {activeOrder.estimated_delivery &&
              ` · Arriving ${spotlightDateFormatter.format(new Date(activeOrder.estimated_delivery))}`}
          </p>
          <div className="spotlight-progress" aria-hidden="true">
            {STATUS_STEPS.map((step, i) => (
              <div key={step.key} className={`seg${i <= currentIndex ? ' done' : ''}`} />
            ))}
          </div>
        </div>
        <Link to={`/orders/${activeOrder.order_number}`} className="order-card-details-link">
          View Details
        </Link>
      </section>
    );
  }

  const lastDelivered = orders.find((o) => o.status === 'delivered');
  const isRecent =
    lastDelivered && Date.now() - new Date(lastDelivered.created_at).getTime() <= RECENT_DELIVERY_WINDOW_MS;

  if (lastDelivered && isRecent) {
    // How many deliveries actually qualify as "recent" (not just which one
    // is most recent) - only known past this point, since it's the same
    // RECENT_DELIVERY_WINDOW_MS proxy the single-delivery check above
    // already uses. Needed to decide whether the stacked-deck look below
    // is honest here at all: a single recent delivery must never render as
    // a stack of one.
    const recentDeliveryCount = orders.filter(
      (o) => o.status === 'delivered' && Date.now() - new Date(o.created_at).getTime() <= RECENT_DELIVERY_WINDOW_MS
    ).length;
    const moreCount = recentDeliveryCount - 1;

    const card = (
      <section className="spotlight fade-in">
        <ProductImage icon={lastDelivered.product_icon} size="md" />
        <div className="spotlight-body">
          <span className="spotlight-eyebrow status-delivered">Delivered</span>
          <p className="spotlight-title">{lastDelivered.product_name}</p>
          <p className="spotlight-meta">
            {lastDelivered.order_number} · Delivered {spotlightDateFormatter.format(new Date(lastDelivered.created_at))}
            {moreCount > 0 && ` · ${moreCount} more recently delivered`}
          </p>
        </div>
        <div className="spotlight-actions">
          <Link to={`/orders/${lastDelivered.order_number}`} className="spotlight-btn secondary">
            View Details
          </Link>
          {computeOrderTotal(lastDelivered) !== null && (
            <button type="button" className="spotlight-btn primary" onClick={() => downloadInvoice(lastDelivered)}>
              <DownloadIcon /> Download Invoice
            </button>
          )}
        </div>
      </section>
    );

    // The stacked-deck look folded in from the earlier Recent Deliveries
    // concept (rather than that living as its own separate widget) - only
    // when there's genuinely a second (or more) recent delivery behind
    // this one. Ghosts are purely decorative (aria-hidden, no content of
    // their own); the real card in front is still the one thing a screen
    // reader or a click lands on.
    if (moreCount === 0) return card;
    return (
      <div className="spotlight-slot has-stack">
        <div className="spotlight-ghost g2" aria-hidden="true" />
        <div className="spotlight-ghost g1" aria-hidden="true" />
        {card}
      </div>
    );
  }

  return (
    <section className="spotlight fade-in">
      <span className="product-image product-image-md" aria-hidden="true">
        <CheckIcon />
      </span>
      <div className="spotlight-body">
        <span className="spotlight-eyebrow quiet">All caught up</span>
        <p className="spotlight-title">No active shipments right now</p>
        <p className="spotlight-meta">
          {lastDelivered
            ? `Your last delivery arrived ${spotlightDateFormatter.format(new Date(lastDelivered.created_at))}.`
            : "You don't have any active shipments right now."}
        </p>
      </div>
    </section>
  );
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

// Content-shaped placeholder (image tile/title/meta/status pill/progress
// bar, matching .order-card's own layout) instead of a plain "Loading..."
// line - previews the real layout so the page doesn't visually jump once
// data arrives, and reads as "orders are coming" rather than just "wait".
// aria-hidden since the loading announcement itself lives once in the
// sr-only text next to this, not repeated per skeleton row.
function OrderCardSkeleton() {
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
      <span className="skeleton order-card-skeleton-line order-card-skeleton-line--headline" />
      <span className="skeleton order-card-skeleton-line order-card-skeleton-line--subtext" />
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

export function OrdersPage() {
  const { email, logout } = useAuth();
  const { orders, nextCursor, loadingMore, error, loadMore, selectedCategories } = useOrders();
  const [activeFilter, setActiveFilter] = useState('all');

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
  // Status (filter tabs) and category (sidebar chips) narrow the same list
  // together, not separately - an order has to match the active status
  // tab AND (if any categories are selected) be one of them. No categories
  // selected means no category narrowing at all, not "show nothing" - an
  // empty multi-select reads as "no filter applied", the same convention
  // "All Orders" already uses for the status tabs.
  const visibleOrders = orders
    ? orders
        .filter((o) => !activeStatuses || activeStatuses.includes(o.status))
        .filter((o) => selectedCategories.size === 0 || selectedCategories.has(o.product_icon))
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
          AI Assistant toggle (see Layout.jsx's PAGE_HEADERS). The subtitle
          that used to sit here is gone too, not just relocated - a
          high-density SaaS header goes straight from the header's own
          divider line to the Spotlight/filter tabs, no explanatory line
          between them.
          A real, static header now, not part of the scrollable content at
          all - .order-cards-scroll below only ever holds the cards
          themselves. See .orders-header's own comment in index.css for
          why (a plain border + shadow now, not the sticky/blurred
          treatment tried here first). */}
      <div className="orders-header">
        <ActiveOrderSpotlight />

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

          {/* Moved here from the shared page header (see Layout.jsx) - still
              the one intentionally inert piece of this page, a plain <span>
              copying a reference design's structure, since this app has no
              global-search backend for it to actually do something. */}
          <div className="storefront-search" aria-hidden="true">
            <SearchIcon />
            <span>Search for products, orders...</span>
            <span className="storefront-search-kbd">⌘K</span>
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
            <ul className="order-cards" aria-hidden="true">
              <OrderCardSkeleton />
              <OrderCardSkeleton />
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
        {orders && orders.length > 0 && visibleOrders.length === 0 && (
          <p className="subtitle fade-in">No orders in this category.</p>
        )}

        {visibleOrders && visibleOrders.length > 0 && (
          <>
            <ul className="order-cards fade-in">
              {visibleOrders.map((order) => (
                <li key={order.order_number} className="order-card">
                  <Link to={`/orders/${order.order_number}`} className="order-card-details-link">
                    View Details
                  </Link>
                  <div className="order-card-top">
                    <ProductImage icon={order.product_icon} size="lg" />
                    <div className="order-card-info">
                      <p className="order-card-product">{order.product_name}</p>
                      <p className="order-card-meta">
                        <span className="order-card-id">{order.order_number}</span>
                        <span aria-hidden="true">&bull;</span>
                        <span>{dateTimeFormatter.format(new Date(order.created_at))}</span>
                        <span aria-hidden="true">&bull;</span>
                        <span>Qty: 1</span>
                      </p>
                      <span className={`order-status status-${order.status}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {order.status === 'cancelled' ? (
                    <OrderProgress status={order.status} />
                  ) : (
                    <>
                      <p className="order-card-headline">{STATUS_MESSAGES[order.status].headline}</p>
                      <p className="order-card-subtext">{STATUS_MESSAGES[order.status].text}</p>
                      <OrderProgress status={order.status} />
                    </>
                  )}
                </li>
              ))}
            </ul>

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
