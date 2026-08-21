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
  UndoIcon,
  XIcon,
} from '../components/icons.jsx';

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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

export const CARRIER_TRACKING_URL = {
  UPS: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
};

export function trackingUrl(carrier, trackingNumber) {
  const build = carrier && CARRIER_TRACKING_URL[carrier];
  return build ? build(trackingNumber) : null;
}

export const STATUS_STEPS = [
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const JOURNEY_STEPS = [{ key: 'placed', label: 'Order placed' }, ...STATUS_STEPS];

const DELIVERY_HAPPENED = ['delivered', 'returned'];

function journeyDates(order) {
  return {
    placed: formatDate(order.created_at),
    delivered:
      DELIVERY_HAPPENED.includes(order.status)
        ? formatDate(order.estimated_delivery)
        : order.estimated_delivery
          ? `Est. ${formatDate(order.estimated_delivery)}`
          : null,
  };
}

const STATUS_BADGE = {
  delivered: { label: 'Delivered', icon: CheckIcon, className: 'delivered' },
  returned: { label: 'Returned', icon: UndoIcon, className: 'returned' },
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

function OrderJourney({ order }) {
  if (order.status === 'cancelled') {
    return <p className="order-route-cancelled">This order was cancelled.</p>;
  }

  const currentIndex =
    order.status === 'returned'
      ? STATUS_STEPS.length - 1
      : STATUS_STEPS.findIndex((step) => step.key === order.status);
  const dates = journeyDates(order);

  return (
    <ol className="order-journey" aria-label={`Order progress: ${order.status.replace(/_/g, ' ')}`}>
      {JOURNEY_STEPS.map((step, i) => {

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

function NextStep({ order }) {

  if (order.status === 'cancelled' || order.status === 'returned' || !order.tracking_number) return null;
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
    <div className="order-detail-root">
      <Link to="/orders" className="back-link">
        &larr; All Orders
      </Link>
      {}

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
    </div>
  );
}
