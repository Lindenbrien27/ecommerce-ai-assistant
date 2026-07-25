import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';

export function OrdersPage() {
  const headingRef = useFocusOnMount();
  const authorizedFetch = useAuthorizedFetch();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/orders');

        if (res.status === 401) {
          return;
        }

        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your orders.');
          return;
        }

        const data = await res.json();
        if (!cancelled) setOrders(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>
        Your Orders
      </h1>
      <p className="subtitle">Every order placed under your verified email.</p>

      <div aria-live="polite">
        {error && (
          <p className="verify-error" role="alert">
            {error}
          </p>
        )}
        {!error && orders === null && <p className="subtitle">Loading...</p>}
        {orders && orders.length === 0 && <p className="subtitle">No orders found.</p>}

        {orders && orders.length > 0 && (
          <ul className="order-list">
            {orders.map((order) => (
              <li key={order.order_number}>
                <Link to={`/orders/${order.order_number}`} className="order-list-item">
                  <span className="order-number">{order.order_number}</span>
                  <span className="order-product">{order.product_name}</span>
                  <span className={`order-status status-${order.status}`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
