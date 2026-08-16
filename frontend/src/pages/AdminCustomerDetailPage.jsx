import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Same status -> pill class map AdminOrdersPage.jsx already uses.
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

export function AdminCustomerDetailPage() {
  const { logout } = useAdminAuth();
  const { email } = useParams();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCustomer(null);
    fetch(`/api/admin/customers/${encodeURIComponent(email)}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that customer.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCustomer(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/customers/${encodeURIComponent(email)}/orders?cursor=${encodeURIComponent(customer.nextCursor)}`
      );
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong looking up that customer's orders.");
      }
      const data = await res.json();
      setCustomer((prev) => ({ ...prev, orders: [...prev.orders, ...data.orders], nextCursor: data.nextCursor }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !customer) {
    return (
      <div className="admin-order-detail-page">
        <p className="verify-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!customer) return null;

  // Contact info comes from the most recent order (first in the
  // already-DESC-sorted list) - there's no account-level contact info
  // anywhere in this schema beyond the email itself.
  const latest = customer.orders[0];

  return (
    <div className="admin-order-detail-page">
      <h1>{customer.email}</h1>

      {latest && latest.address_line1 && (
        <div className="admin-order-detail-address">
          <span>{latest.recipient_name}</span>
          <span>{latest.address_line1}</span>
          {latest.address_line2 && <span>{latest.address_line2}</span>}
          <span>
            {latest.city}, {latest.state} {latest.postal_code}
          </span>
          <span>{latest.country}</span>
        </div>
      )}

      <div className="admin-order-detail-field">
        <span>Orders</span>
        <span>{customer.orderCount}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Total spent</span>
        <span>{formatCents(customer.totalSpentCents)}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Last order</span>
        <span>{dateFormatter.format(new Date(customer.lastOrderAt))}</span>
      </div>

      <table className="admin-orders-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Product</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {customer.orders.map((order) => (
            <tr key={order.order_number}>
              <td>
                <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
              </td>
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

      {customer.nextCursor && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
