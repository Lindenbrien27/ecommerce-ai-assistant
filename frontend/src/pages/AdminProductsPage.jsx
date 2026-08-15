// frontend/src/pages/AdminProductsPage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { SearchIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

export function AdminProductsPage() {
  const { logout } = useAdminAuth();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/products')
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
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = q.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      )
    : products;

  return (
    <div className="admin-orders-page">
      <h1>Products</h1>

      <div className="admin-orders-toolbar">
        <div className="admin-orders-search">
          <SearchIcon aria-hidden="true" />
          <label htmlFor="admin-products-search" className="sr-only">
            Search products by name, SKU, or category
          </label>
          <input
            id="admin-products-search"
            type="text"
            placeholder="Search by name, SKU, or category..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Link to="/admin/products/new" className="admin-products-new-link">
          New Product
        </Link>
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
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.slug}>
                <td>
                  <Link to={`/admin/products/${product.slug}/edit`}>{product.name}</Link>
                </td>
                <td>{product.sku}</td>
                <td>{product.category}</td>
                <td>{formatCents(product.price_cents)}</td>
                <td>{product.stock_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
