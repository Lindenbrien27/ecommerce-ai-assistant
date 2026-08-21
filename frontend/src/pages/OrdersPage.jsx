import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { AnimatedItem } from '../components/AnimatedList.jsx';
import {
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  EmptyOrdersIcon,
  HomeIcon,
  SearchIcon,
  TruckIcon,
  UndoIcon,
  XIcon,
} from '../components/icons.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';
import { downloadInvoice } from '../utils/invoice.js';
import { STATUS_STEPS, trackingUrl } from './OrderDetailPage.jsx';

const STATUS_FILTERS = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'processing', label: 'Processing', statuses: ['processing'] },
  { key: 'shipped', label: 'Shipped', statuses: ['shipped', 'out_for_delivery'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { key: 'returned', label: 'Returned', statuses: [] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

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
  delivered: { label: 'Delivered', className: 'status-delivered', icon: CheckIcon },
  returned: { label: 'Returned', className: 'status-returned', icon: UndoIcon },
  cancelled: { label: 'Cancelled', className: 'status-cancelled', icon: XIcon },

  processing: { label: 'Processing', className: 'status-active', icon: TruckIcon },
  shipped: { label: 'Shipped', className: 'status-active', icon: TruckIcon },
  out_for_delivery: { label: 'Out for delivery', className: 'status-active', icon: TruckIcon },
};

function historySubtitle(order) {
  const when = dateFormatter.format(new Date(order.created_at));
  if (order.status === 'delivered') return `Delivered ${when}`;
  if (order.status === 'cancelled') return `Cancelled ${when}`;
  if (order.status === 'returned') return `Returned ${when}`;
  return `Ordered ${when}`;
}

const JOURNEY_STAGES = [{ key: 'placed', label: 'Placed' }, ...STATUS_STEPS];
const STAGE_ICON = {
  placed: CheckIcon,
  processing: BoxIcon,
  shipped: TruckIcon,
  out_for_delivery: TruckIcon,
  delivered: HomeIcon,
};

function pickHeroOrder(orders) {
  if (!orders) return null;
  let best = null;
  let bestRank = -1;
  for (const order of orders) {
    const stepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
    if (stepIndex === -1 || !IN_MOTION_STATUSES.includes(order.status)) continue;
    if (stepIndex > bestRank || (stepIndex === bestRank && new Date(order.created_at) > new Date(best.created_at))) {
      best = order;
      bestRank = stepIndex;
    }
  }
  return best;
}

function JourneyHero({ order }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    let raf1;
    let raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAnimated(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const reachedIndex = currentIndex + 1;
  const targetFraction = reachedIndex / (JOURNEY_STAGES.length - 1);
  const total = computeOrderTotal(order);
  const trackUrl = order.tracking_number ? trackingUrl(order.carrier, order.tracking_number) : null;
  const stageLabel = STATUS_STEPS[currentIndex].label;
  const etaText = order.estimated_delivery
    ? `Est. arrival ${dateFormatter.format(new Date(order.estimated_delivery))}`
    : "We'll update this as it moves";

  return (
    <div className="order-live-hero">
      <div className="order-live-top">
        <span className="order-live-badge">
          <span className="order-live-dot" aria-hidden="true" /> Live
        </span>
        <span className="order-live-order-no">{order.order_number}</span>
      </div>
      <p className="order-live-product">
        Your <strong>{order.product_name}</strong> is on its way
      </p>
      <p className="order-live-caption" aria-live="polite">
        {stageLabel} &middot; {etaText}
      </p>

      <div className={`order-live-journey${animated ? ' animated' : ''}`} aria-hidden="true">
        <div className="order-live-track">
          <div className="order-live-track-fill" style={{ '--target': targetFraction }} />
        </div>
        <div className="order-live-marker" style={{ '--target': targetFraction }}>
          <TruckIcon />
        </div>
        <div className="order-live-stops">
          {JOURNEY_STAGES.map((stage, i) => {
            const Icon = STAGE_ICON[stage.key];
            return (
              <span key={stage.key} className={`order-live-stop${i <= reachedIndex ? ' reached' : ''}`}>
                <span className="order-live-stop-dot"><Icon /></span>
                <span className="order-live-stop-label">{stage.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="order-live-actions">
        {trackUrl && (
          <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="order-live-btn primary">
            Track live
          </a>
        )}
        {total !== null && (
          <button type="button" className="order-live-btn" onClick={() => downloadInvoice(order)}>
            <DownloadIcon /> Download invoice
          </button>
        )}
      </div>
    </div>
  );
}

function monthGroupLabel(dateStr, now = new Date()) {
  const d = new Date(dateStr);
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month';
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (d.getFullYear() === prevMonth.getFullYear() && d.getMonth() === prevMonth.getMonth()) return 'Last month';
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
}

function groupByMonth(historyOrders) {
  const groups = [];
  for (const order of historyOrders) {
    const label = monthGroupLabel(order.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.orders.push(order);
    else groups.push({ label, orders: [order] });
  }
  return groups;
}

function OrderHistoryRow({ order, index }) {
  const [expanded, setExpanded] = useState(false);
  const badge = HISTORY_BADGE[order.status] ?? HISTORY_BADGE.delivered;
  const total = computeOrderTotal(order);
  const detailId = `order-row-detail-${order.order_number}`;
  const isActive = IN_MOTION_STATUSES.includes(order.status);

  return (
    <li className={`order-row${order.status === 'cancelled' ? ' cancelled' : ''}${expanded ? ' expanded' : ''}`}>
      {}
      <AnimatedItem as="div" className="order-row-inner" index={index} delay={Math.min(index * 0.03, 0.3)}>
        <button
          type="button"
          className="order-row-summary"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={detailId}
        >
          <ProductImage icon={order.product_icon} size="xs" />
          <span className="order-row-info">
            <span className="order-row-name">{order.product_name}</span>
            <span className="order-row-meta">
              <span className="order-row-number">{order.order_number}</span> · {historySubtitle(order)}
            </span>
          </span>
          <span className={`order-pass-status ${badge.className}`}>
            <badge.icon aria-hidden="true" /> {badge.label}
          </span>
          {total !== null && <span className="order-pass-amount">{formatCents(total)}</span>}
          <ChevronDownIcon className="order-row-chevron" aria-hidden="true" />
        </button>

        {}
        <div
          className={`order-row-detail-wrap${expanded ? ' expanded' : ''}`}
          id={detailId}
          {...(!expanded && { inert: '' })}
        >
          <div className="order-row-detail-clip">
            <div className="order-pass-detail order-row-detail">
              <p className="order-pass-detail-field">
                <span>Order</span>
                <span>{order.order_number} · Qty: 1</span>
              </p>
              {order.status === 'delivered' && order.estimated_delivery && (
                <p className="order-pass-detail-field">
                  <span>Estimated arrival</span>
                  <span>{dateFormatter.format(new Date(order.estimated_delivery))}</span>
                </p>
              )}
              <div className="order-pass-detail-actions">
                <Link to={`/orders/${order.order_number}`} className="order-pass-detail-btn">
                  {isActive ? 'Track package' : 'View Details'}
                </Link>
                {total !== null && (
                  <button type="button" className="order-pass-detail-btn" onClick={() => downloadInvoice(order)}>
                    <DownloadIcon /> Download Invoice
                  </button>
                )}
                {!isActive && (
                  <Link to="/shop" className="order-pass-detail-btn buy-again">
                    Buy again
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </AnimatedItem>
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

  const heroOrder = pickHeroOrder(orders);

  const activeStatuses = STATUS_FILTERS.find((f) => f.key === activeFilter).statuses;
  const query = searchQuery.trim().toLowerCase();
  const historyOrders = orders
    ? orders
        .filter((o) => !heroOrder || o.order_number !== heroOrder.order_number)
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

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);

  }, [activeFilter, counts.all]);

  return (
    <div className="orders-page-root">
      {}
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

          {}
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
        {}
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
            {heroOrder && <JourneyHero order={heroOrder} />}

            <h2 className="section-heading">{heroOrder ? 'Rest of your history' : 'Updated order history'}</h2>

            {historyOrders.length === 0 ? (
              <p className="subtitle fade-in">No orders in this category.</p>
            ) : (
              <div className="order-ledger fade-in">
                {(() => {
                  let i = 0;
                  return groupByMonth(historyOrders).map((group) => (
                    <div className="order-group" key={group.label}>
                      <p className="order-group-label">{group.label}</p>
                      <ul className="order-row-list">
                        {group.orders.map((order) => {
                          const rowIndex = i++;
                          return <OrderHistoryRow key={order.order_number} order={order} index={rowIndex} />;
                        })}
                      </ul>
                    </div>
                  ));
                })()}
              </div>
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
