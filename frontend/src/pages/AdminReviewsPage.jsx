import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { SearchIcon, StarIcon, XIcon, TrashIcon, CheckIcon } from '../components/icons.jsx';

const PAGE_SIZE_OPTIONS = [8, 25, 50];
const DEFAULT_PAGE_SIZE = 8;

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

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

function StarRating({ rating }) {
  return (
    <span className="admin-review-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className={n <= rating ? 'filled' : 'empty'} />
      ))}
    </span>
  );
}

function initialsOf(name) {
  return name.trim()[0]?.toUpperCase() || '?';
}

export function AdminReviewsPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/reviews?${buildQuery({ q, status, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up reviews.');
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
  }, [q, status, page, pageSize, reloadToken]);

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

  async function submitStatus(id, nextStatus) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.status === 401) return logout();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating that review.');
      }
      setSelected(null);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function submitDelete(id) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      if (res.status === 401) return logout();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong deleting that review.');
      }
      setSelected(null);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div className="admin-inventory-page">
      <div className="admin-inventory-head">
        <div className="admin-inventory-head-left">
          <h1>Reviews</h1>
          {data && <span className="admin-inventory-count">{data.totalCount} review{data.totalCount === 1 ? '' : 's'}</span>}
        </div>
        {data && data.pendingCount > 0 && (
          <span className="admin-review-pending-badge">{data.pendingCount} pending</span>
        )}
      </div>

      <div className="admin-inventory-toolbar">
        <div className="admin-inventory-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-review-search" className="sr-only">Search reviews</label>
          <input
            id="admin-review-search"
            type="text"
            placeholder="Search product, author, or review text..."
            value={q}
            onChange={resetToPage1(setQ)}
          />
        </div>

        <label htmlFor="admin-review-status" className="sr-only">Filter by status</label>
        <select id="admin-review-status" value={status} onChange={resetToPage1(setStatus)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && <p className="verify-error" role="alert">{error}</p>}

      {!error && (
        <div className="admin-inventory-table-card">
          <table className="admin-inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Author</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(data?.reviews ?? []).map((review) => (
                <tr key={review.id} className="admin-review-row" onClick={() => setSelected(review)}>
                  <td>
                    <div className="admin-inventory-product-cell">
                      <ProductImage icon={review.product_icon} size="sm" />
                      <span className="admin-inventory-name">{review.product_name}</span>
                    </div>
                  </td>
                  <td><StarRating rating={review.rating} /></td>
                  <td>
                    <span className="admin-inventory-name">{review.title}</span>
                    <span className="admin-inventory-sku admin-review-body-preview">{review.body}</span>
                  </td>
                  <td>
                    <span className="admin-inventory-name">{review.author_name}</span>
                    {review.is_guest && <span className="admin-inventory-sku">Guest</span>}
                  </td>
                  <td>
                    <span className={`admin-review-status-badge ${review.status}`}>{STATUS_LABELS[review.status]}</span>
                  </td>
                  <td>{formatDate(review.created_at)}</td>
                </tr>
              ))}
              {(data?.reviews ?? []).length === 0 && !error && (
                <tr className="admin-inventory-empty-row">
                  <td colSpan={6}>No reviews match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-inventory-pager">
          <div className="admin-inventory-pager-left">
            <label htmlFor="admin-review-page-size">Rows per page</label>
            <select
              id="admin-review-page-size"
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

      {selected && (
        <>
          <button type="button" className="admin-review-drawer-backdrop" aria-label="Close review panel" onClick={() => setSelected(null)} />
          <aside className="admin-review-drawer" aria-label="Review detail">
            <div className="admin-review-drawer-head">
              <div>
                <h2>Review</h2>
                <p>Approve to publish, or reject to hide.</p>
              </div>
              <button type="button" className="admin-review-drawer-close" onClick={() => setSelected(null)} aria-label="Close">
                <XIcon />
              </button>
            </div>

            <div className="admin-review-drawer-product">
              <ProductImage icon={selected.product_icon} size="sm" />
              <div>
                <span className="admin-inventory-name">{selected.product_name}</span>
              </div>
            </div>

            <div className="admin-review-drawer-author">
              <span className="admin-review-avatar" aria-hidden="true">{initialsOf(selected.author_name)}</span>
              <div className="admin-review-drawer-author-meta">
                <span className="admin-review-drawer-author-name">
                  {selected.author_name}
                  <span className={`admin-review-status-badge ${selected.status}`}>{STATUS_LABELS[selected.status]}</span>
                </span>
                <span className="admin-review-drawer-author-sub">
                  <StarRating rating={selected.rating} /> {selected.rating.toFixed(1)} · {formatDate(selected.created_at)}
                </span>
              </div>
            </div>

            <blockquote className="admin-review-drawer-title">&ldquo;{selected.title}&rdquo;</blockquote>
            <p className="admin-review-drawer-body">{selected.body}</p>

            <div className="admin-review-drawer-footer-meta">
              {selected.is_guest && <span className="admin-review-guest-badge">Guest</span>}
            </div>

            {actionError && <p className="verify-error" role="alert">{actionError}</p>}

            <div className="admin-review-drawer-actions">
              <button type="button" className="admin-review-action-delete" onClick={() => submitDelete(selected.id)}>
                <TrashIcon /> Delete
              </button>
              <div className="admin-review-drawer-actions-right">
                <button
                  type="button"
                  className="admin-review-action-reject"
                  onClick={() => submitStatus(selected.id, 'rejected')}
                  disabled={selected.status === 'rejected'}
                >
                  <XIcon /> Reject
                </button>
                <button
                  type="button"
                  className="admin-review-action-approve"
                  onClick={() => submitStatus(selected.id, 'approved')}
                  disabled={selected.status === 'approved'}
                >
                  <CheckIcon /> Approve
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
