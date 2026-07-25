import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function OrderDetailPage() {
  const { orderNumber } = useParams();
  const { token, logout } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError(null);

    async function load() {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          logout();
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
  }, [orderNumber, token, logout]);

  return (
    <>
      <Link to="/orders" className="back-link">
        &larr; Back to orders
      </Link>
      <h1>{orderNumber}</h1>

      {error && <p className="verify-error">{error}</p>}
      {!error && !order && <p className="subtitle">Loading...</p>}

      {order && (
        <dl className="order-detail">
          <dt>Product</dt>
          <dd>{order.product_name}</dd>

          <dt>Status</dt>
          <dd>{order.status.replace(/_/g, ' ')}</dd>

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
              <dd>{order.estimated_delivery}</dd>
            </>
          )}
        </dl>
      )}
    </>
  );
}
