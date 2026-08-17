import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

function buildQuery({ q, urgency, supplier, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (urgency) params.set('urgency', urgency);
  if (supplier) params.set('supplier', supplier);
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

export function AdminReorderQueuePage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState('');
  const [supplier, setSupplier] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/inventory/reorder?${buildQuery({ q, urgency, supplier, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up the reorder queue.');
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
  }, [q, urgency, supplier, page, pageSize]);

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
          <h1>Reorder Queue</h1>
          <span className="admin-inventory-count">{total} SKUs</span>
        </div>
      </div>

      {stats && (
        <>
          <div className="admin-inventory-stats">
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">At-risk inventory value</p>
              <p className="admin-inventory-stat-value">{formatCents(stats.at_risk_value_cents)}</p>
            </div>
            <div className="admin-inventory-stat-card">
              <p className="admin-inventory-stat-label">SKUs needing action</p>
              <p className="admin-inventory-stat-value">{stats.needing_action_count}</p>
            </div>
          </div>

          <div className="admin-inventory-health">
            <div className="admin-inventory-health-bar-wrap">
              <div className="admin-inventory-health-bar">
                {stats.low_stock_count > 0 && (
                  <span className="admin-inventory-health-bar-segment low-stock" style={{ width: `${(stats.low_stock_count / stats.needing_action_count) * 100}%` }} />
                )}
                {stats.out_of_stock_count > 0 && (
                  <span className="admin-inventory-health-bar-segment out-of-stock" style={{ width: `${(stats.out_of_stock_count / stats.needing_action_count) * 100}%` }} />
                )}
              </div>
              <div className="admin-inventory-health-legend">
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
          <label htmlFor="admin-reorder-search" className="sr-only">Search SKU or product</label>
          <input id="admin-reorder-search" type="text" placeholder="Search SKU or product..." value={q} onChange={resetToPage1(setQ)} />
        </div>

        <label htmlFor="admin-reorder-urgency" className="sr-only">Filter by urgency</label>
        <select id="admin-reorder-urgency" value={urgency} onChange={resetToPage1(setUrgency)}>
          <option value="">All urgency</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>

        <label htmlFor="admin-reorder-supplier" className="sr-only">Filter by supplier</label>
        <select id="admin-reorder-supplier" value={supplier} onChange={resetToPage1(setSupplier)}>
          <option value="">All suppliers</option>
          {(data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-inventory-table-card">
          <table className="admin-inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="admin-inventory-num">Available</th>
                <th className="admin-inventory-num">Reorder point</th>
                <th className="admin-inventory-num">Deficit</th>
                <th className="admin-inventory-num">Suggested PO</th>
                <th>Supplier</th>
                <th className="admin-inventory-num">Days of cover</th>
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
                  <td className="admin-inventory-num">{item.available}</td>
                  <td className="admin-inventory-num">{item.reorder_point}</td>
                  <td className="admin-inventory-num">{item.deficit}</td>
                  <td className="admin-inventory-num">{item.suggested_po_qty}</td>
                  <td>
                    {item.supplier_name ?? '—'}
                    {item.lead_time_days != null && <span className="admin-inventory-sku"> {item.lead_time_days}d lead</span>}
                  </td>
                  <td className="admin-inventory-num">{item.days_of_cover === null ? '—' : `${Math.round(item.days_of_cover)}d`}</td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && !error && (
                <tr className="admin-inventory-empty-row">
                  <td colSpan={7}>No SKUs are below their reorder point.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-inventory-pager">
          <div className="admin-inventory-pager-left">
            <label htmlFor="admin-reorder-page-size">Rows per page</label>
            <select id="admin-reorder-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
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
