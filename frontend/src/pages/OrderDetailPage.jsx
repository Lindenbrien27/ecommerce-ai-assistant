import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
          <dl className="order-detail">
            <dt>Product</dt>
            <dd>{order.product_name}</dd>

            <dt>Status</dt>
            <dd>
              <span className={`order-status status-${order.status}`}>{order.status.replace(/_/g, ' ')}</span>
            </dd>

            <dt>Ordered on</dt>
            <dd>{formatDate(order.created_at)}</dd>

            {order.carrier && (
              <>
                <dt>Carrier</dt>
                <dd>{order.carrier}</dd>
              </>
            )}

            {order.tracking_number && (
              <>
                <dt>Tracking number</dt>
                <dd>{order.tracking_number}</dd>
              </>
            )}

            {order.estimated_delivery && (
              <>
                <dt>Estimated delivery</dt>
                <dd>{formatDate(order.estimated_delivery)}</dd>
              </>
            )}
          </dl>

          <h2 className="status-timeline-heading">Order progress</h2>
          <StatusTimeline status={order.status} />
        </>
      )}
    </>
  );
}
