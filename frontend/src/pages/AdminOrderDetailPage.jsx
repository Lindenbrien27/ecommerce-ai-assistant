import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const STATUS_OPTIONS = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function AdminOrderDetailPage() {
  useAdminAuth();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOrder(null);
    fetch(`/api/admin/orders/${orderNumber}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that order.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setOrder(data);
        setSelectedStatus(data.status);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  async function saveStatus() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating that order.');
      }
      const updated = await res.json();
      setOrder(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !order) {
    return (
      <div className="admin-order-detail-page">
        <p className="verify-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!order) return null;

  const total = computeOrderTotal(order);

  return (
    <div className="admin-order-detail-page">
      <h1>{order.order_number}</h1>

      <div className="admin-order-detail-field">
        <span>Customer</span>
        <span>{order.customer_email}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Product</span>
        <span>{order.product_name}</span>
      </div>
      <div className="admin-order-detail-field">
        <span>Ordered</span>
        <span>{dateFormatter.format(new Date(order.created_at))}</span>
      </div>
      {order.carrier && (
        <div className="admin-order-detail-field">
          <span>Carrier</span>
          <span>{order.carrier}</span>
        </div>
      )}
      {order.tracking_number && (
        <div className="admin-order-detail-field">
          <span>Tracking #</span>
          <span>{order.tracking_number}</span>
        </div>
      )}
      {total !== null && (
        <div className="admin-order-detail-field">
          <span>Total paid</span>
          <span>{formatCents(total)}</span>
        </div>
      )}

      <div className="admin-order-detail-status">
        <label htmlFor="admin-order-status-select">Change status</label>
        <select
          id="admin-order-status-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" onClick={saveStatus} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {saved && <p className="admin-order-detail-saved">Status updated.</p>}
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
