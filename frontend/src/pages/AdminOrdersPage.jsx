import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

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
// values. This page pins those classes to their dark-mode colors
// regardless of the site's own light/dark toggle (see index.css).
const STATUS_BADGE_CLASS = {
  processing: 'status-active',
  shipped: 'status-active',
  out_for_delivery: 'status-active',
  delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function buildQuery({ status, q, page, pageSize }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

// Windowed page-number list with ellipsis gaps, e.g. [1, 'ellipsis-start',
// 4, 5, 6, 'ellipsis-end', 12] - the two ellipsis entries get distinct
// string values (not both '...') because they're both real list entries
// React needs a stable, unique `key` for.
function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

export function AdminOrdersPage() {
  const { logout } = useAdminAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  // Re-fetches whenever any of these four change. Unlike the old
  // cursor-based "Load more" version, every page navigation goes through
  // this same effect (not a separately-invoked function), so the
  // standard `cancelled` cleanup flag is enough to drop a stale in-flight
  // response - no extra staleness bookkeeping needed.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/orders?${buildQuery({ status, q, page, pageSize })}`)
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
        setTotal(data.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [status, q, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function handleStatusChange(e) {
    setStatus(e.target.value);
    setPage(1);
  }

  function handleSearchChange(e) {
    setQ(e.target.value);
    setPage(1);
  }

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
  }

  function handleClear() {
    setStatus('');
    setQ('');
    setPage(1);
  }

  return (
    <div className="admin-orders-page">
      <div className="admin-orders-head">
        <h1>Orders</h1>
        <span className="admin-orders-count">
          {total} order{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="admin-orders-toolbar">
        <label htmlFor="admin-orders-status" className="sr-only">
          Filter by status
        </label>
        <select id="admin-orders-status" value={status} onChange={handleStatusChange}>
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
            onChange={handleSearchChange}
          />
        </div>

        <button
          type="button"
          className="admin-orders-clear"
          onClick={handleClear}
          disabled={!status && !q}
        >
          Clear
        </button>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <div className="admin-orders-table-card">
          <table className="admin-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th className="admin-orders-num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totalCents = computeOrderTotal(order);
                return (
                  <tr key={order.order_number}>
                    <td>
                      <div className="admin-orders-order-cell">
                        <Link to={`/admin/orders/${order.order_number}`}>{order.order_number}</Link>
                        <span className="admin-orders-order-date">
                          {dateFormatter.format(new Date(order.created_at))}
                        </span>
                      </div>
                    </td>
                    <td className="admin-orders-email">{order.customer_email}</td>
                    <td>{order.product_name}</td>
                    <td className="admin-orders-num admin-orders-total">
                      {totalCents == null ? '—' : formatCents(totalCents)}
                    </td>
                    <td>
                      <span className={`order-history-badge ${STATUS_BADGE_CLASS[order.status] ?? 'status-active'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr className="admin-orders-empty-row">
                  <td colSpan={5}>No orders match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-orders-pager">
          <div className="admin-orders-pager-left">
            <label htmlFor="admin-orders-page-size">Rows per page</label>
            <select id="admin-orders-page-size" value={pageSize} onChange={handlePageSizeChange}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>

          <div className="admin-orders-pager-right">
            <button
              type="button"
              className="admin-orders-page-btn"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              &lsaquo;
            </button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button
                  key={p}
                  type="button"
                  className={`admin-orders-page-btn${p === page ? ' current' : ''}`}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ) : (
                <span key={p} className="admin-orders-page-ellipsis" aria-hidden="true">
                  &hellip;
                </span>
              )
            )}
            <button
              type="button"
              className="admin-orders-page-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount}
              aria-label="Next page"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
