import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { formatCents } from '../utils/pricing.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function formatDiscount(code) {
  return code.discount_type === 'percentage' ? `${code.discount_value}%` : formatCents(code.discount_value);
}

function formatUsage(code) {
  return `${code.usage_count} / ${code.usage_limit == null ? '∞' : code.usage_limit}`;
}

function formatExpiry(code) {
  return code.expires_at ? dateFormatter.format(new Date(code.expires_at)) : 'Never';
}

export function AdminPromoCodesPage() {
  const { logout } = useAdminAuth();
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch('/api/admin/promo-codes')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up promo codes.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setCodes(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-promo-codes-page">
      <div className="admin-promo-codes-head">
        <h1>Promo Codes</h1>
        <Link to="/admin/promo-codes/new" className="admin-promo-codes-new-link">
          New Code
        </Link>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <table className="admin-promo-codes-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Usage</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.code}>
                <td>
                  <Link to={`/admin/promo-codes/${encodeURIComponent(code.code)}/edit`}>{code.code}</Link>
                </td>
                <td>{formatDiscount(code)}</td>
                <td>{formatUsage(code)}</td>
                <td>{formatExpiry(code)}</td>
                <td>
                  <span className={`admin-promo-codes-status${code.active ? ' active' : ''}`}>
                    {code.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-promo-codes-empty-row">
                  No promo codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
