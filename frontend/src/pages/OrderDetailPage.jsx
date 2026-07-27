import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { ProductImage } from '../components/ProductImage.jsx';

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatCents = (cents) => currencyFormatter.format(cents / 100);

// unit_price_cents is the one field of the four that's never optional once
// present at all (see migrations/1785095226496_add-order-pricing-and-
// product-icon.sql) - treating it as "pricing data exists for this order"
// and falling back to nothing rather than a summary with holes in it for
// any order seeded before that migration.
function OrderSummary({ order }) {
  if (order.unit_price_cents == null) return null;

  const total =
    order.unit_price_cents + (order.delivery_cost_cents || 0) + (order.vat_cents || 0) - (order.voucher_cents || 0);

  return (
    <div className="order-summary">
      <div className="order-summary-row">
        <span>Original price</span>
        <span>{formatCents(order.unit_price_cents)}</span>
      </div>
      <div className="order-summary-row">
        <span>Delivery</span>
        <span>{order.delivery_cost_cents ? formatCents(order.delivery_cost_cents) : 'Free'}</span>
      </div>
      <div className="order-summary-row">
        <span>VAT</span>
        <span>{formatCents(order.vat_cents || 0)}</span>
      </div>
      {order.voucher_cents > 0 && (
        <div className="order-summary-row order-summary-voucher">
          <span>Voucher{order.voucher_code ? ` (${order.voucher_code})` : ''}</span>
          <span>-{formatCents(order.voucher_cents)}</span>
        </div>
      )}
      <div className="order-summary-row order-summary-total">
        <span>Total</span>
        <span>{formatCents(total)}</span>
      </div>
    </div>
  );
}

// Best-effort - estimated_delivery is a free TEXT column (see
// migrations/1784973065584_initial-schema.sql), not a guaranteed-parseable
// date type. Seed data happens to store ISO dates, but nothing enforces
// that server-side, so an unparseable value falls back to the raw string
// rather than rendering "Invalid Date".
function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

// Real tracking-page URLs for the three carriers this app's seed data
// actually uses (see migrations/1784973065584_initial-schema.sql) - not
// guessing at a generic format, since each carrier's own URL scheme is
// different. Falls back to plain, non-linked text for any other/unknown
// carrier rather than building a link that would 404.
const CARRIER_TRACKING_URL = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
};

function trackingUrl(carrier, trackingNumber) {
  const build = carrier && CARRIER_TRACKING_URL[carrier];
  return build ? build(trackingNumber) : null;
}

// The four forward-progression statuses this app actually has (see the
// `status` CHECK constraint in the same migration) - cancelled is handled
// separately below since it's a branch-off, not a further step in this
// sequence, and the order data model has no history of *which* step a
// cancelled order reached before it was cancelled to honestly place it here.
const STATUS_STEPS = [
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

function StatusTimeline({ status }) {
  if (status === 'cancelled') {
    return <p className="status-timeline-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === status);

  return (
    <ol className="status-timeline">
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`status-timeline-step${i <= currentIndex ? ' completed' : ''}${
            i === currentIndex ? ' current' : ''
          }`}
        >
          <span className="status-timeline-marker" aria-hidden="true" />
          <span className="status-timeline-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function OrderDetailPage() {
  const { orderNumber } = useParams();
  useDocumentTitle(orderNumber);
  const headingRef = useFocusOnMount();
  const authorizedFetch = useAuthorizedFetch();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError(null);

    async function load() {
      try {
        const res = await authorizedFetch(`/api/orders/${encodeURIComponent(orderNumber)}`);

        if (res.status === 401) {
          return;
        }

        if (res.status === 404) {
          if (!cancelled) setError('Order not found.');
          return;
        }

        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading this order.');
          return;
        }

        const data = await res.json();
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, authorizedFetch]);

  return (
    <>
      <Link to="/orders" className="back-link">
        &larr; All Orders
      </Link>
      <h1 ref={headingRef} tabIndex={-1} className="order-id-heading">
        {orderNumber}
      </h1>

      <div aria-live="polite">
        {error && (
          <p className="verify-error" role="alert">
            {error}
          </p>
        )}
        {!error && !order && <p className="subtitle">Loading...</p>}
      </div>

      {order && (
        <>
          <div className="order-product-row">
            <ProductImage icon={order.product_icon} size="lg" />
            <p className="order-product-name">{order.product_name}</p>
          </div>

          {/* Grouped in pairs that actually relate to each other (its
              state, then the two dates, then the two shipping specifics)
              instead of one flat list - also what lets this use a real
              2-column grid instead of a single narrow column leaving the
              wider card's right half empty. */}
          <dl className="order-detail">
            <div className="order-detail-field">
              <dt>Status</dt>
              <dd>
                <span className={`order-status status-${order.status}`}>{order.status.replace(/_/g, ' ')}</span>
              </dd>
            </div>

            <div className="order-detail-field">
              <dt>Ordered on</dt>
              <dd>{formatDate(order.created_at)}</dd>
            </div>
            {order.estimated_delivery && (
              <div className="order-detail-field">
                <dt>Estimated delivery</dt>
                <dd>{formatDate(order.estimated_delivery)}</dd>
              </div>
            )}

            {order.carrier && (
              <div className="order-detail-field">
                <dt>Carrier</dt>
                <dd>{order.carrier}</dd>
              </div>
            )}
            {order.tracking_number && (
              <div className="order-detail-field">
                <dt>Tracking number</dt>
                <dd>
                  {trackingUrl(order.carrier, order.tracking_number) ? (
                    <a href={trackingUrl(order.carrier, order.tracking_number)} target="_blank" rel="noopener noreferrer">
                      {order.tracking_number}
                    </a>
                  ) : (
                    order.tracking_number
                  )}
                </dd>
              </div>
            )}
          </dl>

          <h2 className="section-heading">Order summary</h2>
          <OrderSummary order={order} />

          <h2 className="section-heading">Order progress</h2>
          <StatusTimeline status={order.status} />
        </>
      )}
    </>
  );
}
