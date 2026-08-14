import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Same status -> pill class map OrdersPage.jsx's HISTORY_BADGE already
// uses (index.css's .order-history-badge.status-* rules) - reused here
// rather than inventing a second admin-only palette for the same five
// values.
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ status, q, cursor }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function AdminOrdersPage() {
  const { logout } = useAdminAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Always mirrors the latest status/q from the render that just happened
  // (assigned during render, not in an effect, so it's current the instant
  // a loadMore response comes back - see loadMore below).
  const filtersRef = useRef({ status, q });
  filtersRef.current = { status, q };

  // Re-fetches page one whenever the status filter or search text changes -
  // this table is admin-wide and can be large, so filtering happens
  // server-side (unlike OrdersPage.jsx's client-side filter over one
  // customer's already-small history).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/orders?${buildQuery({ status, q })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up orders.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setOrders(data.orders);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, q]);

  async function loadMore() {
    // Snapshot the filters this request is *for*. If status/q change before
    // the response lands (e.g. the admin picks a new status filter while a
    // "Load more" fetch is still in flight), filtersRef.current will have
    // moved on by the time we get here and we drop the stale response
    // instead of appending wrong-filter rows or clobbering nextCursor.
    const requestFilters = { status, q };
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/orders?${buildQuery({ status, q, cursor: nextCursor })}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong looking up orders.');
      }
      const data = await res.json();
      const stale = filtersRef.current.status !== requestFilters.status || filtersRef.current.q !== requestFilters.q;
      if (stale) return;
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      const stale = filtersRef.current.status !== requestFilters.status || filtersRef.current.q !== requestFilters.q;
      if (!stale) setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-orders-page">
      <h1>Orders</h1>

      <div className="admin-orders-toolbar">
        <label htmlFor="admin-orders-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="admin-orders-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-orders-search" className="sr-only">
            Search orders by order number or email
          </label>
          <input
            id="admin-orders-search"
            type="text"
            placeholder="Search by order # or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <table className="admin-orders-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.order_number}>
                <td>
                  <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
                </td>
                <td>{order.customer_email}</td>
                <td>{order.product_name}</td>
                <td>
                  <span className={`order-history-badge ${STATUS_BADGE_CLASS[order.status] ?? 'status-active'}`}>
                    {order.status}
                  </span>
                </td>
                <td>{dateFormatter.format(new Date(order.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!error && nextCursor && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
