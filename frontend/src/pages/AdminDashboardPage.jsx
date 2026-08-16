import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatCents } from '../utils/pricing.js';

export function AdminDashboardPage() {
  const { logout } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // Fetches once on mount - unlike AdminOrdersPage/AdminProductsPage,
  // this page has no filters/pagination params to react to.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/admin/dashboard')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading the dashboard.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-dashboard-page">
      <h1>Dashboard</h1>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && stats && (
        <>
          <div className="admin-dashboard-stats">
            <div className="admin-dashboard-stat-card">
              <p className="admin-dashboard-stat-label">Total Revenue</p>
              <p className="admin-dashboard-stat-value">{formatCents(stats.total_revenue_cents)}</p>
            </div>
            <div className="admin-dashboard-stat-card">
              <p className="admin-dashboard-stat-label">Total Orders</p>
              <p className="admin-dashboard-stat-value">{stats.total_orders}</p>
            </div>
            <div className="admin-dashboard-stat-card">
              <p className="admin-dashboard-stat-label">Average Order Value</p>
              <p className="admin-dashboard-stat-value">{formatCents(stats.average_order_value_cents)}</p>
            </div>
          </div>

          <div className="admin-dashboard-top-products">
            <h2>Top Products</h2>
            <table className="admin-dashboard-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_products.map((product) => (
                  <tr key={product.product_name}>
                    <td>
                      <div className="admin-dashboard-product-cell">
                        <ProductImage icon={product.product_icon} size="sm" />
                        {product.product_name}
                      </div>
                    </td>
                    <td>{product.units_sold}</td>
                    <td>{formatCents(product.revenue_cents)}</td>
                  </tr>
                ))}
                {stats.top_products.length === 0 && (
                  <tr>
                    <td colSpan={3} className="admin-dashboard-empty-row">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
