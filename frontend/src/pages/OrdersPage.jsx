import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { BarChartIcon, CheckIcon, ChevronDownIcon, EmptyOrdersIcon, TrendArrowIcon } from '../components/icons.jsx';

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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VOLUME_PERIODS = [
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'lastYear', label: 'Last Year' },
];

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
// % change is only ever shown when there's a real prior period to compare
// against (see 'lastYear' in buildVolumeData, which has none) - never a
// percentage computed from nothing.
function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
function countByMonth(orders, year) {
  const counts = new Array(12).fill(0);
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === year) counts[d.getMonth()] += 1;
  });
  return counts;
}
function countByDay(orders, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const counts = new Array(daysInMonth).fill(0);
  orders.forEach((o) => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === year && d.getMonth() === month) counts[d.getDate() - 1] += 1;
  });
  return counts;
}

// The real distribution behind Order Volume - built fresh from the
// customer's own orders on every render (cheap for the order counts this
// app deals with), keyed off the real current date rather than a fixed
// reference the way this widget's own design mockup did (a demo needs a
// frozen "today" so its numbers don't drift depending on when someone
// opens it; live software should just ask what day it actually is).
function buildVolumeData(orders) {
  const today = new Date();
  const thisYear = today.getFullYear();
  const lastYear = thisYear - 1;
  const thisMonthIdx = today.getMonth();
  const lastMonthDate = new Date(thisYear, thisMonthIdx - 1, 1);
  const lastMonthYear = lastMonthDate.getFullYear();
  const lastMonthIdx = lastMonthDate.getMonth();
  const monthBeforeLastDate = new Date(lastMonthYear, lastMonthIdx - 1, 1);

  const lastMonthBars = countByDay(orders, lastMonthYear, lastMonthIdx).map((c, i) => ({
    label: String(i + 1),
    count: c,
  }));
  // This Year only ever shows elapsed months (Jan through whatever month it
  // actually is) - it never invents zero-order bars for months that haven't
  // happened yet.
  const thisYearBars = countByMonth(orders, thisYear)
    .slice(0, thisMonthIdx + 1)
    .map((c, i) => ({ label: MONTH_NAMES[i], count: c, isCurrent: i === thisMonthIdx }));
  const lastYearBars = countByMonth(orders, lastYear).map((c, i) => ({ label: MONTH_NAMES[i], count: c }));

  return {
    lastMonth: {
      bars: lastMonthBars,
      collapsed: 10,
      total: sum(lastMonthBars.map((b) => b.count)),
      compare: sum(countByDay(orders, monthBeforeLastDate.getFullYear(), monthBeforeLastDate.getMonth())),
      compareLabel: 'the previous month',
    },
    thisYear: {
      bars: thisYearBars,
      collapsed: 4,
      total: sum(thisYearBars.map((b) => b.count)),
      compare: sum(countByMonth(orders, lastYear).slice(0, thisMonthIdx + 1)),
      compareLabel: 'this time last year',
    },
    lastYear: {
      bars: lastYearBars,
      collapsed: 6,
      total: sum(lastYearBars.map((b) => b.count)),
      compare: null,
      compareLabel: null,
    },
  };
}

// Order Volume needs the customer's *entire* order history to compute
// honest Last Year/This Year totals - the shared OrdersContext used by the
// visible card list deliberately only holds one manually-paginated page at
// a time (see its own comment), which is the right call for a list a
// person scrolls/loads more of, but would silently understate this
// widget's own numbers once someone has more than one page of history.
// MAX_PAGE_SIZE server-side is 100 (see src/services/orderService.js) -
// comfortably above what any real customer of this app has - so this
// almost always resolves in a single request; the cursor loop only matters
// at all for the rare account that somehow exceeds that.
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
        // Order Volume is a supplementary widget, not critical path - if
        // its own fetch fails, it just doesn't render (see the null check
        // in OrderVolume below) rather than surfacing a second error
        // banner next to the real one OrdersContext already owns.
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  return history;
}

// The signature element above the filter tabs - real order counts over
// time, not a decorative chart. Answers a different question than the
// filter tabs/each order's own stepper below it (which are both about
// current status): "how many orders, over time." The Last Month/This
// Year/Last Year switch reuses the exact same segmented-control markup/
// CSS as the filter tabs just below (.order-filter-tabs/.order-filter-tab/
// .order-filter-indicator) - same glide, same hover/press/focus states,
// a second independent instance rather than a one-off control. The bar
// chart itself is decorative (aria-hidden) - the big number/trend/caption
// above it already state the same real data as accessible text, and a
// bare color/height swatch with no visible label per bar has nothing
// further to add there.
function OrderVolume() {
  const orders = useOrderHistory();
  const [periodKey, setPeriodKey] = useState('thisYear');
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const tabRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const activeTab = tabRefs.current[periodKey];
    if (activeTab) {
      setIndicatorStyle({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
    }
  }, [periodKey]);

  if (orders === null) {
    return (
      <section className="volume" aria-hidden="true">
        <div className="volume-head">
          <div className="volume-title-group">
            <span className="volume-title-icon">
              <BarChartIcon />
            </span>
            <p className="volume-title">Order Volume</p>
          </div>
        </div>
        <span className="skeleton volume-skeleton" />
      </section>
    );
  }

  if (orders.length === 0) return null;

  const data = buildVolumeData(orders);
  const period = data[periodKey];
  const bars = expanded ? period.bars : period.bars.slice(-period.collapsed);
  const max = Math.max(1, ...bars.map((b) => b.count));
  const labelStep = bars.length > 10 ? Math.ceil(bars.length / 8) : 1;
  const change = pctChange(period.total, period.compare);
  const canExpand = period.bars.length > period.collapsed;

  function selectPeriod(key) {
    setPeriodKey(key);
    // A newly-selected period always starts collapsed, same as any
    // freshly-opened view - "show more" is a choice made per period, not
    // a setting that should silently carry over to a different one.
    setExpanded(false);
  }

  return (
    <section className={`volume fade-in${minimized ? ' volume--minimized' : ''}`}>
      {/* The header itself is the minimize/maximize toggle - same "the row
          you'd click anyway is the control" pattern the AI panel's own
          header already uses, rather than a separate small icon button
          competing for space next to the total pill. */}
      <button
        type="button"
        className="volume-head"
        onClick={() => setMinimized((m) => !m)}
        aria-expanded={!minimized}
      >
        <div className="volume-title-group">
          <span className="volume-title-icon" aria-hidden="true">
            <BarChartIcon />
          </span>
          <p className="volume-title">Order Volume</p>
        </div>
        <span className="volume-head-right">
          <span className="volume-total">
            {orders.length} order{orders.length === 1 ? '' : 's'} all-time
          </span>
          <ChevronDownIcon className="volume-head-chevron" aria-hidden="true" />
        </span>
      </button>

      {!minimized && (
        <>
      <nav className="order-filter-tabs volume-tabs" aria-label="Order volume time period">
        <span
          className="order-filter-indicator"
          style={{ transform: `translateX(${indicatorStyle.left}px)`, width: `${indicatorStyle.width}px` }}
          aria-hidden="true"
        />
        {VOLUME_PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            ref={(el) => (tabRefs.current[p.key] = el)}
            className={`order-filter-tab${periodKey === p.key ? ' active' : ''}`}
            onClick={() => selectPeriod(p.key)}
            aria-pressed={periodKey === p.key}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div className="volume-stat-row">
        <div className="volume-stat-main">
          <span className="volume-stat-number">{period.total}</span>
          <span className="volume-stat-unit">orders</span>
        </div>
        {change !== null && (
          <span className={`volume-trend ${change >= 0 ? 'is-up' : 'is-down'}`}>
            <TrendArrowIcon up={change >= 0} />
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="volume-caption">
        {change === null
          ? `${period.total} order${period.total === 1 ? '' : 's'} total for this period.`
          : `${Math.abs(change)}% ${change >= 0 ? 'more' : 'fewer'} orders than ${period.compareLabel}.`}
      </p>

      <div className="volume-chart" aria-hidden="true">
        {bars.map((b, i) => {
          const h = Math.max(6, (b.count / max) * 100);
          const showLabel = i % labelStep === 0 || i === bars.length - 1;
          return (
            <div
              key={`${periodKey}-${b.label}-${i}`}
              className={`volume-bar-col${b.isCurrent ? ' is-current' : ''}`}
              title={`${b.label}: ${b.count} order${b.count === 1 ? '' : 's'}`}
            >
              <div className="volume-bar-track">
                <span className="volume-bar" style={{ height: `${h}%` }} />
              </div>
              <span className={`volume-bar-label${showLabel ? '' : ' is-hidden'}`}>{b.label}</span>
            </div>
          );
        })}
      </div>

      {canExpand && (
        <div className="volume-more-row">
          <button
            type="button"
            className={`volume-more-btn${expanded ? ' is-expanded' : ''}`}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Show less' : 'Show more'}
            <ChevronDownIcon />
          </button>
        </div>
      )}
        </>
      )}
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
  const tabRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
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
    const activeTab = tabRefs.current[activeFilter];
    if (activeTab) {
      setIndicatorStyle({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
    }
    // counts.all is a stand-in for "any tab's count changed" - every count
    // recomputes together whenever `orders` resolves, so watching one is
    // enough to re-measure after their post-fetch width change.
  }, [activeFilter, counts.all]);

  return (
    <>
      {/* The heading itself (and the decorative header-art flourish that
          used to sit next to it) is gone from here - Layout.jsx now owns
          "Your Orders" as part of the shared page-header row alongside the
          search bar/theme toggle (see Layout.jsx's PAGE_HEADERS). The
          subtitle that used to sit here is gone too, not just relocated -
          a high-density SaaS header goes straight from the header's own
          divider line to the filter tabs, no explanatory line between
          them. */}
      <OrderVolume />

      <nav className="order-filter-tabs" aria-label="Filter orders by status">
        <span
          className="order-filter-indicator"
          style={{ transform: `translateX(${indicatorStyle.left}px)`, width: `${indicatorStyle.width}px` }}
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

      <div aria-live="polite">
        {error && (
          <p className="verify-error" role="alert">
            {error}
          </p>
        )}
        {!error && orders === null && (
          <>
            <p className="sr-only">Loading your orders…</p>
            <div className="order-cards-scroll slim-scroll">
              <ul className="order-cards" aria-hidden="true">
                <OrderCardSkeleton />
                <OrderCardSkeleton />
              </ul>
            </div>
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
          <div className="order-cards-scroll slim-scroll">
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
          </div>
        )}
      </div>
    </>
  );
}
