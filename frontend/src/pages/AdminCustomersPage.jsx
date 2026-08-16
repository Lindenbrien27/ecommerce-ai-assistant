// frontend/src/pages/AdminCustomersPage.jsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ q, page }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page) params.set('page', String(page));
  return params.toString();
}

export function AdminCustomersPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Same "snapshot the request's own filters, drop a stale response"
  // pattern AdminOrdersPage.jsx's loadMore already uses.
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPage(1);
    fetch(`/api/admin/customers?${buildQuery({ q, page: 1 })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up customers.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCustomers(data.customers);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function loadMore() {
    const requestQ = q;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/customers?${buildQuery({ q, page: nextPage })}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong looking up customers.');
      }
      const data = await res.json();
      if (qRef.current !== requestQ) return;
      setCustomers((prev) => [...prev, ...data.customers]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (err) {
      if (qRef.current === requestQ) setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-orders-page">
      <h1>Customers</h1>

      <div className="admin-orders-toolbar">
        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-customers-search" className="sr-only">
            Search customers by email
          </label>
          <input
            id="admin-customers-search"
            type="text"
            placeholder="Search by email..."
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
              <th>Email</th>
              <th>Orders</th>
              <th>Total spent</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.customer_email}>
                <td>
                  <Link to={`/admin/customers/${encodeURIComponent(customer.customer_email)}`}>
                    {customer.customer_email}
                  </Link>
                </td>
                <td>{customer.order_count}</td>
                <td>{formatCents(customer.total_spent_cents)}</td>
                <td>{dateFormatter.format(new Date(customer.last_order_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!error && hasMore && (
        <button type="button" className="order-cards-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
