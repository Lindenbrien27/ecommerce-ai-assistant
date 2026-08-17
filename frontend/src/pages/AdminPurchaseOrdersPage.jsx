import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [8, 25, 50];
const DEFAULT_PAGE_SIZE = 8;

const STATUS_LABELS = { draft: 'Draft', received: 'Received', cancelled: 'Cancelled' };

function buildQuery({ q, status, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

function buildPageList(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('ellipsis-start');
  for (let p = Math.max(2, current - 1); p <= Math.min(pageCount - 1, current + 1); p++) pages.push(p);
  if (current < pageCount - 2) pages.push('ellipsis-end');
  pages.push(pageCount);
  return pages;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AdminPurchaseOrdersPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory/purchase-orders?${buildQuery({ q, status, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up purchase orders.');
        }
        return res.json();
      })
      .then((result) => {
        if (cancelled || !result) return;
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, status, page, pageSize]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function resetToPage1(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div className="admin-inventory-page">
      <div className="admin-inventory-head">
        <div className="admin-inventory-head-left">
          <h1>Purchase Orders</h1>
          {data && <span className="admin-inventory-count">{data.openCount} open</span>}
        </div>
      </div>

      <div className="admin-inventory-toolbar">
        <div className="admin-inventory-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-po-search" className="sr-only">Search PO or supplier</label>
          <input id="admin-po-search" type="text" placeholder="Search PO or supplier..." value={q} onChange={resetToPage1(setQ)} />
        </div>

        <label htmlFor="admin-po-status" className="sr-only">Filter by status</label>
        <select id="admin-po-status" value={status} onChange={resetToPage1(setStatus)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-inventory-table-card">
          <table className="admin-inventory-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th className="admin-inventory-num">Total</th>
                <th>Receive into</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(data?.purchaseOrders ?? []).map((po) => (
                <tr key={po.id}>
                  <td>
                    <span className="admin-inventory-name">{po.po_number}</span>
                    <span className="admin-inventory-sku">{po.supplier_name}</span>
                  </td>
                  <td>{po.item_count} SKU{po.item_count === 1 ? '' : 's'} · {po.total_units} units</td>
                  <td className="admin-inventory-num admin-inventory-price-current">{formatCents(po.total_cents)}</td>
                  <td>{po.receive_into_location}</td>
                  <td>
                    <span className={`admin-po-status-badge ${po.status}`}>{STATUS_LABELS[po.status]}</span>
                  </td>
                  <td>
                    {po.status === 'received' ? formatDate(po.received_date) : formatDate(po.expected_date)}
                    <span className="admin-inventory-sku"> {po.status === 'received' ? 'Received' : 'Expected'}</span>
                  </td>
                </tr>
              ))}
              {(data?.purchaseOrders ?? []).length === 0 && !error && (
                <tr className="admin-inventory-empty-row">
                  <td colSpan={6}>No purchase orders match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-inventory-pager">
          <div className="admin-inventory-pager-left">
            <label htmlFor="admin-po-page-size">Rows per page</label>
            <select id="admin-po-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>
          <div className="admin-inventory-pager-right">
            <button type="button" className="admin-inventory-page-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">&lsaquo;</button>
            {buildPageList(page, pageCount).map((p) =>
              typeof p === 'number' ? (
                <button key={p} type="button" className={`admin-inventory-page-btn${p === page ? ' current' : ''}`} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ) : (
                <span key={p} className="admin-inventory-page-ellipsis" aria-hidden="true">&hellip;</span>
              )
            )}
            <button type="button" className="admin-inventory-page-btn" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount} aria-label="Next page">&rsaquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
