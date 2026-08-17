import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

const STATUS_LABELS = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };

function buildQuery({ q, category, location, supplier, status, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (location) params.set('location', location);
  if (supplier) params.set('supplier', supplier);
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

export function AdminStockLedgerPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory?${buildQuery({ q, category, location, supplier, status, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up inventory.');
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
  }, [q, category, location, supplier, status, page, pageSize]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const stats = data?.stats;

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
          <h1>Stock Ledger</h1>
          <span className="admin-inventory-count">{total} SKUs</span>
        </div>
      </div>

      {stats && (
        <>
          <div className="admin-inventory-stats">
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Days of Cover</p>
              <p className="admin-inventory-stat-value">
                {stats.days_of_cover === null ? '—' : `${stats.days_of_cover.toFixed(1)}d`}
              </p>
              <p className="admin-inventory-stat-sub">{stats.avg_lead_time_days.toFixed(1)}d avg lead time</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Reorder Risk</p>
              <p className="admin-inventory-stat-value">{stats.reorder_risk_count}</p>
              <p className="admin-inventory-stat-sub">of {stats.total_skus} SKUs</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Units On Hand</p>
              <p className="admin-inventory-stat-value">{stats.units_on_hand.toLocaleString()}</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">Allocated</p>
              <p className="admin-inventory-stat-value">{stats.allocated.toLocaleString()}</p>
              <p className="admin-inventory-stat-sub">{stats.total_skus} SKUs tracked</p>
            </div>
          </div>

          <div className="admin-inventory-health">
            <div>
              <p className="admin-inventory-stat-label">Total Stock Value</p>
              <p className="admin-inventory-health-value">{formatCents(stats.total_stock_value_cents)}</p>
            </div>
            <div className="admin-inventory-health-bar-wrap">
              <div className="admin-inventory-health-bar">
                {stats.in_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment in-stock"
                    style={{ width: `${(stats.in_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
                {stats.low_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment low-stock"
                    style={{ width: `${(stats.low_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
                {stats.out_of_stock_count > 0 && (
                  <span
                    className="admin-inventory-health-bar-segment out-of-stock"
                    style={{ width: `${(stats.out_of_stock_count / stats.total_skus) * 100}%` }}
                  />
                )}
              </div>
              <div className="admin-inventory-health-legend">
                <span><span className="admin-inventory-health-legend-dot in-stock" />In stock: {stats.in_stock_count}</span>
                <span><span className="admin-inventory-health-legend-dot low-stock" />Low stock: {stats.low_stock_count}</span>
                <span><span className="admin-inventory-health-legend-dot out-of-stock" />Out of stock: {stats.out_of_stock_count}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="admin-inventory-toolbar">
        <div className="admin-inventory-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-inventory-search" className="sr-only">Search SKUs by product or SKU code</label>
          <input
            id="admin-inventory-search"
            type="text"
            placeholder="Search SKUs..."
            value={q}
            onChange={resetToPage1(setQ)}
          />
        </div>

        <label htmlFor="admin-inventory-category" className="sr-only">Filter by category</label>
        <select id="admin-inventory-category" value={category} onChange={resetToPage1(setCategory)}>
          <option value="">All categories</option>
          {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label htmlFor="admin-inventory-location" className="sr-only">Filter by location</label>
        <select id="admin-inventory-location" value={location} onChange={resetToPage1(setLocation)}>
          <option value="">All locations</option>
          {(data?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <label htmlFor="admin-inventory-supplier" className="sr-only">Filter by supplier</label>
        <select id="admin-inventory-supplier" value={supplier} onChange={resetToPage1(setSupplier)}>
          <option value="">All suppliers</option>
          {(data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label htmlFor="admin-inventory-status" className="sr-only">Filter by status</label>
        <select id="admin-inventory-status" value={status} onChange={resetToPage1(setStatus)}>
          <option value="">All statuses</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-inventory-table-card">
          <table className="admin-inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Location</th>
                <th className="admin-inventory-num">On hand</th>
                <th className="admin-inventory-num">Allocated</th>
                <th className="admin-inventory-num">Available</th>
                <th className="admin-inventory-num">Reorder point</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="admin-inventory-product-cell">
                      <ProductImage icon={item.icon} size="sm" />
                      <div>
                        <span className="admin-inventory-name">{item.product_name}</span>
                        <span className="admin-inventory-sku">{item.sku_code}</span>
                      </div>
                    </div>
                  </td>
                  <td>{item.location_name}</td>
                  <td className="admin-inventory-num">{item.on_hand}</td>
                  <td className="admin-inventory-num">{item.allocated}</td>
                  <td className="admin-inventory-num">{item.available}</td>
                  <td className="admin-inventory-num">{item.reorder_point}</td>
                  <td>
                    <span className={`admin-inventory-stock-badge ${item.status.replace(/_/g, '-')}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && !error && (
                <tr className="admin-inventory-empty-row">
                  <td colSpan={7}>No SKUs match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-inventory-pager">
          <div className="admin-inventory-pager-left">
            <label htmlFor="admin-inventory-page-size">Rows per page</label>
            <select
              id="admin-inventory-page-size"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
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
