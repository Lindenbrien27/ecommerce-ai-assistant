import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useFocusOnMount } from '../hooks/useFocusOnMount.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { ProductImage } from '../components/ProductImage.jsx';

// "Returned" has no matching value in this app's real `status` enum (see
// the CHECK constraint in migrations/1784973065584_initial-schema.sql) -
// kept in the list since it's part of the reference design being copied,
// but its count is always 0 and its filter always empty rather than
// matching it to some other status that isn't actually the same thing.
const STATUS_FILTERS = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'shipping', label: 'On shipping', statuses: ['shipped', 'out_for_delivery'] },
  { key: 'arrived', label: 'Arrived', statuses: ['delivered'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { key: 'returned', label: 'Returned', statuses: [] },
];

export function OrdersPage() {
  useDocumentTitle('Your Orders');
  const headingRef = useFocusOnMount();
  const authorizedFetch = useAuthorizedFetch();
  const [orders, setOrders] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

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
      <h1 ref={headingRef} tabIndex={-1}>
        Your Orders
      </h1>
      <p className="subtitle">Every order placed under your verified email.</p>

      <div className="orders-layout">
        <nav className="order-filter-sidebar" aria-label="Filter orders by status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`order-filter-item${activeFilter === filter.key ? ' active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
              aria-pressed={activeFilter === filter.key}
            >
              <span>{filter.label}</span>
              <span className="order-filter-count">{counts[filter.key]}</span>
            </button>
          ))}
        </nav>

        <div className="orders-list-panel" aria-live="polite">
          {error && (
            <p className="verify-error" role="alert">
              {error}
            </p>
          )}
          {!error && orders === null && <p className="subtitle">Loading...</p>}
          {orders && orders.length === 0 && <p className="subtitle">No orders found.</p>}
          {orders && orders.length > 0 && visibleOrders.length === 0 && (
            <p className="subtitle">No orders in this category.</p>
          )}

          {visibleOrders && visibleOrders.length > 0 && (
            <ul className="order-list">
              {visibleOrders.map((order) => (
                <li key={order.order_number}>
                  <Link to={`/orders/${order.order_number}`} className="order-list-item">
                    <ProductImage icon={order.product_icon} size="sm" />
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
      </div>
    </>
  );
}
