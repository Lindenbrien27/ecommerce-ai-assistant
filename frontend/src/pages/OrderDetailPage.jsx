import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';
import { downloadInvoice, invoiceMailtoUrl } from '../utils/invoice.js';
import {
  BrandMarkIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  MailIcon,
  PrinterIcon,
  QuestionIcon,
  XIcon,
} from '../components/icons.jsx';

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// computeOrderTotal itself already handles the "no pricing data at all"
// case (see utils/pricing.js) - null here means skip the cost breakdown
// entirely rather than rendering one with holes in it.
function CostBreakdown({ order }) {
  const total = computeOrderTotal(order);
  if (total === null) return null;

  return (
    <div className="order-summary">
      <div className="order-summary-row">
        <span>Subtotal</span>
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

// The vertical journey's own first node - "Order placed" isn't one of this
// app's real status values (the status column starts at 'processing'
// already), but created_at is a real timestamp for the moment the order
// came in, and every order has one, so it's an honest first step rather
// than a fabricated "Payment authorized" event this app has no separate
// timestamp for.
const JOURNEY_STEPS = [{ key: 'placed', label: 'Order placed' }, ...STATUS_STEPS];

// Only "placed" and "delivered" have a real date anywhere in this app's
// data model (order.created_at / .estimated_delivery) - there's no
// per-step timestamp history for "processing"/"shipped"/"out for
// delivery", so those intentionally show no date under them rather than a
// fabricated one. "Est." only prefixes the delivered date while the order
// hasn't actually arrived yet - once status is genuinely 'delivered',
// estimated_delivery doubles as an honest stand-in for when that happened
// (same convention OrdersPage's own historySubtitle already uses), so
// calling it an *estimate* at that point would be less accurate, not more.
function journeyDates(order) {
  return {
    placed: formatDate(order.created_at),
    delivered:
      order.status === 'delivered'
        ? formatDate(order.estimated_delivery)
        : order.estimated_delivery
          ? `Est. ${formatDate(order.estimated_delivery)}`
          : null,
  };
}

const STATUS_BADGE = {
  delivered: { label: 'Delivered', icon: CheckIcon, className: 'delivered' },
  cancelled: { label: 'Cancelled', icon: XIcon, className: 'cancelled' },
};

function StatusBadge({ status }) {
  const step = STATUS_STEPS.find((s) => s.key === status);
  const badge = STATUS_BADGE[status] ?? { label: step?.label ?? status.replace(/_/g, ' '), icon: ClockIcon, className: 'active' };
  const Icon = badge.icon;
  return (
    <span className={`order-status-badge ${badge.className}`}>
      <Icon aria-hidden="true" /> {badge.label}
    </span>
  );
}

// The left panel's vertical timeline (replacing the old horizontal route
// stepper) - completed steps get a small filled dot, the current step a
// larger one (the one moment worth calling out), upcoming steps a hollow
// ring, all on one continuous connecting line.
function OrderJourney({ order }) {
  if (order.status === 'cancelled') {
    return <p className="order-route-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = STATUS_STEPS.findIndex((step) => step.key === order.status);
  const dates = journeyDates(order);

  return (
    <ol className="order-journey" aria-label={`Order progress: ${order.status.replace(/_/g, ' ')}`}>
      {JOURNEY_STEPS.map((step, i) => {
        // "placed" (i === 0) always already happened; the four real
        // statuses start at journey index 1, so currentIndex (into
        // STATUS_STEPS) shifts by one to line up with this longer list.
        const stepIndex = i - 1;
        const completed = i === 0 || stepIndex <= currentIndex;
        const current = i !== 0 && stepIndex === currentIndex;
        return (
          <li
            key={step.key}
            className={`order-journey-step${completed ? ' completed' : ''}${current ? ' current' : ''}`}
          >
            <span className="order-journey-dot" aria-hidden="true" />
            <span className="order-journey-title">{step.label}</span>
            {dates[step.key] && <span className="order-journey-date">{dates[step.key]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// The one real, working next action this app can back with actual data -
// only rendered when the order actually has a carrier/tracking number, and
// only a clickable link when that carrier's own URL scheme is known (see
// trackingUrl above) rather than a button that would lead nowhere.
function NextStep({ order }) {
  if (order.status === 'cancelled' || !order.tracking_number) return null;
  const url = trackingUrl(order.carrier, order.tracking_number);

  return (
    <div className="order-next-step order-manifest">
      <p className="order-journey-label">Next step</p>
      <p className="order-tracking-line">
        Tracking <span className="order-tracking-number">{order.tracking_number}</span>
      </p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="order-track-btn">
          Track shipment
          <ChevronRightIcon aria-hidden="true" />
        </a>
      )}
    </div>
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

  const total = order ? computeOrderTotal(order) : null;
  const mailtoUrl = order ? invoiceMailtoUrl(order) : null;

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
          <div className="order-receipt-header">
            <div className="order-brand-row">
              <span className="order-brand-mark" aria-hidden="true">
                <BrandMarkIcon />
              </span>
              <span className="order-brand-text">
                <span className="order-brand-name">Order Support Assistant</span>
                <span className="order-brand-sub">Order receipt</span>
              </span>
            </div>
            <div className="order-receipt-actions">
              {total !== null && (
                <button type="button" className="order-receipt-action-btn" onClick={() => downloadInvoice(order)}>
                  <DownloadIcon /> Download
                </button>
              )}
              {mailtoUrl && (
                <a href={mailtoUrl} className="order-receipt-action-btn square" aria-label="Email this receipt" title="Email this receipt">
                  <MailIcon />
                </a>
              )}
              <button
                type="button"
                className="order-receipt-action-btn square"
                onClick={() => window.print()}
                aria-label="Print this receipt"
                title="Print this receipt"
              >
                <PrinterIcon />
              </button>
            </div>
          </div>

          <div className="order-status-card order-label-card">
            <div className="order-status-card-left">
              <div className="order-status-card-row">
                <StatusBadge status={order.status} />
                <span className="order-placed-date">Placed {formatDate(order.created_at)}</span>
              </div>
              <div className="order-product-row">
                <ProductImage icon={order.product_icon} size="sm" />
                <div>
                  <p className="order-number">{order.order_number}</p>
                  <p className="order-product-name">{order.product_name}</p>
                </div>
              </div>
            </div>
            {total !== null && (
              <div className="order-status-card-right">
                <span className="order-total-label">Total paid</span>
                <span className="order-total-value">{formatCents(total)}</span>
              </div>
            )}
          </div>

          <div className="order-detail-grid">
            <div className="order-detail-panel">
              <p className="order-journey-label">Order journey</p>
              <OrderJourney order={order} />
              <NextStep order={order} />
            </div>

            <div className="order-detail-panel">
              <p className="order-journey-label">Order details</p>
              <p className="order-detail-count">1 item</p>
              <div className="order-item-row">
                <ProductImage icon={order.product_icon} size="xs" />
                <div className="order-item-info">
                  <p className="order-item-name">{order.product_name}</p>
                  <p className="order-item-meta">Qty: 1</p>
                </div>
                {order.unit_price_cents != null && <p className="order-item-price">{formatCents(order.unit_price_cents)}</p>}
              </div>
              <CostBreakdown order={order} />
            </div>
          </div>

          <p className="order-help-row">
            <Link to="/chat">
              <QuestionIcon aria-hidden="true" />
              Need help with this order?
            </Link>
          </p>
        </>
      )}
    </>
  );
}
