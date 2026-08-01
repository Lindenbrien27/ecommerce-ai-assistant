import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// computeOrderTotal itself already handles the "no pricing data at all"
// case (see utils/pricing.js) - null here means skip the summary entirely
// rather than rendering one with holes in it.
function OrderSummary({ order }) {
  const total = computeOrderTotal(order);
  if (total === null) return null;

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

// Only the first (processing) and last (delivered) steps have a real date
// anywhere in this app's data model (order.created_at / .estimated_delivery)
// - there's no per-step timestamp history for "shipped" or "out for
// delivery" (see the `orders` table), so those two intentionally show no
// date under the route rather than a fabricated one.
function stepDates(order) {
  return {
    processing: formatDate(order.created_at),
    delivered: order.estimated_delivery ? `Est. ${formatDate(order.estimated_delivery)}` : null,
  };
}

function OrderRoute({ order }) {
  if (order.status === 'cancelled') {
    return <p className="order-route-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === order.status);
  const dates = stepDates(order);

  return (
    <ol className="order-route" aria-label={`Order progress: ${order.status.replace(/_/g, ' ')}`}>
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`order-route-step${i <= currentIndex ? ' completed' : ''}${
            i === currentIndex ? ' current' : ''
          }`}
        >
          <span className="order-route-node" aria-hidden="true" />
          <span className="order-route-label">{step.label}</span>
          {dates[step.key] && <span className="order-route-date">{dates[step.key]}</span>}
        </li>
      ))}
    </ol>
  );
}

export function OrderDetailPage() {
  const { orderNumber } = useParams();
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
      {/* The heading (the order number itself) moved into Layout.jsx's
          shared page-header row, alongside the search bar/theme toggle -
          see Layout.jsx's getPageHeader, which reads it from :orderNumber. */}

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
          {/* The order detail page's content is real shipping data - an
              order number, a carrier, a tracking number, a status, two
              dates - the same information an actual shipping label
              carries, not generic card content. This card + the perforated
              divider + the route below lean into that directly instead of
              treating it as one more flat status card. */}
          <div className="order-label-card">
            <div className="order-label-top">
              <div className="order-product-row">
                <ProductImage icon={order.product_icon} size="lg" />
                <p className="order-product-name">{order.product_name}</p>
              </div>
              <span className={`order-status status-${order.status}`}>{order.status.replace(/_/g, ' ')}</span>
            </div>

            <div className="order-perforation" aria-hidden="true" />

            <OrderRoute order={order} />
          </div>

          {(order.carrier || order.tracking_number) && (
            <dl className="order-manifest">
              {order.carrier && (
                <div className="order-manifest-field">
                  <dt>Carrier</dt>
                  <dd>{order.carrier}</dd>
                </div>
              )}
              {order.tracking_number && (
                <div className="order-manifest-field">
                  <dt>Tracking no.</dt>
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
          )}

          <h2 className="section-heading">Order summary</h2>
          <OrderSummary order={order} />
        </>
      )}
    </>
  );
}
