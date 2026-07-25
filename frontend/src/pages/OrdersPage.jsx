import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';

export function OrdersPage() {
  const headingRef = useFocusOnMount();
  const authorizedFetch = useAuthorizedFetch();
  const [orders, setOrders] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  async function loadPage(cursor) {
    const url = cursor ? `/api/orders?cursor=${encodeURIComponent(cursor)}` : '/api/orders';
    const res = await authorizedFetch(url);

    if (res.status === 401) {
      return null;
    }

    if (!res.ok) {
      setError('Something went wrong loading your orders.');
      return null;
    }

    return res.json();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await loadPage();
        if (!data || cancelled) return;
        setOrders(data.orders);
        setNextCursor(data.nextCursor);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const data = await loadPage(nextCursor);
      if (!data) return;
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

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

        {nextCursor && (
          <button type="button" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </>
  );
}
