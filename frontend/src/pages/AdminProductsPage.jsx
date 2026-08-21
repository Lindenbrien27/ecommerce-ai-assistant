import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';
import { AdminNewProductSheet } from '../components/AdminNewProductSheet.jsx';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

function buildQuery({ q, category, page, pageSize }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
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

function stockBadge(stockQuantity) {
  if (stockQuantity <= 0) return { className: 'out-of-stock', label: 'Out of Stock' };
  if (stockQuantity < 10) return { className: 'low-stock', label: 'Low Stock' };
  return { className: 'in-stock', label: 'In Stock' };
}

export function AdminProductsPage() {
  const { logout } = useAdminAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/admin/products?${buildQuery({ q, category, page, pageSize })}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up products.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setProducts(data.products);
        setTotal(data.total);
        setCategories(data.categories);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [q, category, page, pageSize, reloadToken]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function handleSearchChange(e) {
    setQ(e.target.value);
    setPage(1);
  }

  function handleCategoryChange(e) {
    setCategory(e.target.value);
    setPage(1);
  }

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
  }

  function handleClear() {
    setQ('');
    setCategory('');
    setPage(1);
  }

  return (
    <div className="admin-products-page">
      <div className="admin-products-head">
        <div className="admin-products-head-left">
          <h1>Products</h1>
          <span className="admin-products-count">
            {total} product{total === 1 ? '' : 's'}
          </span>
        </div>
        <AdminNewProductSheet onCreated={() => setReloadToken((t) => t + 1)} />
      </div>

      <div className="admin-products-toolbar">
        <div className="admin-products-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-products-search" className="sr-only">
            Search products by name, SKU, or category
          </label>
          <input
            id="admin-products-search"
            type="text"
            placeholder="Search by name, SKU, or category..."
            value={q}
            onChange={handleSearchChange}
          />
        </div>

        <label htmlFor="admin-products-category" className="sr-only">
          Filter by category
        </label>
        <select id="admin-products-category" value={category} onChange={handleCategoryChange}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="admin-products-clear"
          onClick={handleClear}
          disabled={!q && !category}
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
        <div className="admin-products-table-card">
          <table className="admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="admin-products-num">Price</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const badge = stockBadge(product.stock_quantity);
                return (
                  <tr key={product.slug}>
                    <td>
                      <div className="admin-products-product-cell">
                        <ProductImage icon={product.icon} size="sm" />
                        <div>
                          <Link className="admin-products-name" to={`/admin/products/${product.slug}/edit`}>
                            {product.name}
                          </Link>
                          <span className="admin-products-sku">{product.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td>{product.category}</td>
                    <td className="admin-products-num admin-products-price">
                      <span className="admin-products-price-current">{formatCents(product.price_cents)}</span>
                      {product.original_price_cents != null && (
                        <span className="admin-products-price-original">{formatCents(product.original_price_cents)}</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-products-stock-cell">
                        <span className="admin-products-stock-count">{product.stock_quantity}</span>
                        <span className={`admin-products-stock-badge ${badge.className}`}>{badge.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr className="admin-products-empty-row">
                  <td colSpan={4}>No products match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && (
        <div className="admin-products-pager">
          <div className="admin-products-pager-left">
            <label htmlFor="admin-products-page-size">Rows per page</label>
            <select id="admin-products-page-size" value={pageSize} onChange={handlePageSizeChange}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>{total === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${total}`}</span>
          </div>

          <div className="admin-products-pager-right">
            <button
              type="button"
              className="admin-products-page-btn"
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
                  className={`admin-products-page-btn${p === page ? ' current' : ''}`}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ) : (
                <span key={p} className="admin-products-page-ellipsis" aria-hidden="true">
                  &hellip;
                </span>
              )
            )}
            <button
              type="button"
              className="admin-products-page-btn"
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
