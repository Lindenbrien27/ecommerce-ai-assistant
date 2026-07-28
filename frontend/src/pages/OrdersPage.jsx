import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOrders } from '../context/OrdersContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { CheckIcon, EmptyOrdersIcon } from '../components/icons.jsx';

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
    <ol className="order-progress" aria-label={`Order progress: ${status.replace(/_/g, ' ')}`}>
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`order-progress-step${i <= currentIndex ? ' completed' : ''}${
            i === currentIndex ? ' current' : ''
          }`}
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
      {/* The heading itself (and the decorative header-art flourish that
          used to sit next to it) is gone from here - Layout.jsx now owns
          "Your Orders" as part of the shared page-header row alongside the
          search bar/theme toggle (see Layout.jsx's PAGE_HEADERS). */}
      <p className="subtitle">Every order placed under your verified email.</p>

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
            explains why rather than just saying "not found." "Try a
            different email" just signs out - ProtectedRoute already sends a
            signed-out visitor to /verify, so there's no separate redirect
            to wire up here. */}
        {orders && orders.length === 0 && (
          <div className="orders-empty-state">
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
          <p className="subtitle">No orders in this category.</p>
        )}

        {visibleOrders && visibleOrders.length > 0 && (
          <ul className="order-cards">
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
