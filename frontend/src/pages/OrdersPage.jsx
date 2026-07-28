import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrders } from '../context/OrdersContext.jsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { CheckSquareIcon, ClipboardIcon, PackageIcon, TruckIcon } from '../components/icons.jsx';

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
// the icon/headline/subtext an order card shows for it - cancelled is
// handled separately in OrderProgress below since it's a branch-off, not a
// further step in this sequence.
const STATUS_STEPS = [
  { key: 'processing', label: 'Processing', icon: ClipboardIcon },
  { key: 'shipped', label: 'Shipped', icon: PackageIcon },
  { key: 'out_for_delivery', label: 'Out for delivery', icon: TruckIcon },
  { key: 'delivered', label: 'Delivered', icon: CheckSquareIcon },
];
const STATUS_MESSAGES = {
  processing: { headline: 'Your order is being processed', text: 'We are preparing your order for shipment.' },
  shipped: { headline: 'Your order has shipped', text: 'Your package is on its way to the carrier facility.' },
  out_for_delivery: { headline: 'Out for delivery', text: 'Your order is on the way to you.' },
  delivered: { headline: 'Delivered', text: 'Your order has been delivered.' },
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function OrderProgress({ status }) {
  if (status === 'cancelled') {
    return <p className="order-progress-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="order-progress">
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`order-progress-step${i <= currentIndex ? ' completed' : ''}${
            i === currentIndex ? ' current' : ''
          }`}
        >
          <span className="order-progress-icon" aria-hidden="true">
            <step.icon />
          </span>
          <span className="order-progress-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function OrdersPage() {
  useDocumentTitle('Your Orders');
  const headingRef = useFocusOnMount();
  const { orders, nextCursor, loadingMore, error, loadMore } = useOrders();
  const [activeFilter, setActiveFilter] = useState('all');

  const counts = {};
  for (const filter of STATUS_FILTERS) {
    counts[filter.key] = orders
      ? filter.statuses === null
        ? orders.length
        : orders.filter((o) => filter.statuses.includes(o.status)).length
      : 0;
  }

  const activeStatuses = STATUS_FILTERS.find((f) => f.key === activeFilter).statuses;
  const visibleOrders = orders && activeStatuses ? orders.filter((o) => activeStatuses.includes(o.status)) : orders;

  return (
    <>
      <div className="orders-header">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Your Orders
          </h1>
          <p className="subtitle">Every order placed under your verified email.</p>
        </div>
        {/* Purely decorative flourish, not a product photo - nothing here
            claims to depict a real shipment. */}
        <svg className="orders-header-art" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <rect x="28" y="42" width="64" height="52" rx="6" fill="var(--color-solid-bg)" opacity="0.9" />
          <path d="M28 58h64" stroke="var(--color-solid-bg-hover)" strokeWidth="3" />
          <path d="M52 42v52M68 42v52" stroke="var(--color-solid-bg-hover)" strokeWidth="3" />
          <circle cx="94" cy="88" r="14" fill="var(--color-bg)" stroke="var(--color-solid-bg)" strokeWidth="3" />
          <path d="M88 88l4 4 8-8" stroke="var(--color-solid-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <g stroke="var(--color-solid-bg)" strokeWidth="2.5" strokeLinecap="round" opacity="0.6">
            <path d="M22 30l4 4M22 34l-4 0M96 26l0 5M100 30l-4 4" />
          </g>
        </svg>
      </div>

      <nav className="order-filter-tabs" aria-label="Filter orders by status">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`order-filter-tab${activeFilter === filter.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(filter.key)}
            aria-pressed={activeFilter === filter.key}
          >
            {filter.label} <span className="order-filter-count">{counts[filter.key]}</span>
          </button>
        ))}
      </nav>

      <div aria-live="polite">
        {error && (
          <p className="verify-error" role="alert">
            {error}
          </p>
        )}
        {!error && orders === null && <p className="subtitle">Loading...</p>}
        {/* A real, expected state now, not just a theoretical edge case -
            any email that verifies via OTP lands here, whether or not it's
            ever actually placed an order (see README > Auth), so this
            explains why rather than just saying "not found." */}
        {orders && orders.length === 0 && (
          <p className="subtitle">No orders found for this email. If you used a different email at checkout, sign out and verify with that one instead.</p>
        )}
        {orders && orders.length > 0 && visibleOrders.length === 0 && (
          <p className="subtitle">No orders in this category.</p>
        )}

        {visibleOrders && visibleOrders.length > 0 && (
          <ul className="order-cards">
            {visibleOrders.map((order) => (
              <li key={order.order_number} className="order-card">
                <div className="order-card-top">
                  <ProductImage icon={order.product_icon} size="lg" />
                  <div className="order-card-info">
                    <p className="order-card-id">{order.order_number}</p>
                    <p className="order-card-date">{dateTimeFormatter.format(new Date(order.created_at))}</p>
                    <p className="order-card-product">{order.product_name}</p>
                    <span className="order-card-qty">Quantity: 1</span>
                  </div>
                  <div className="order-card-actions">
                    <span className={`order-status status-${order.status}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <Link to={`/orders/${order.order_number}`} className="order-card-details-link">
                      View Details
                    </Link>
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
        )}

        {nextCursor && (
          <button type="button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>

      {orders && orders.length > 0 && (
        <div className="orders-support-banner">
          <div>
            <p className="orders-support-banner-title">Have questions about your order?</p>
            <p className="orders-support-banner-text">We're here to help you with any issues.</p>
          </div>
          <div className="orders-support-banner-actions">
            <span className="orders-support-banner-help" aria-hidden="true">
              Visit Help Center
            </span>
            <Link to="/chat" className="orders-support-banner-chat">
              Chat with Support
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
