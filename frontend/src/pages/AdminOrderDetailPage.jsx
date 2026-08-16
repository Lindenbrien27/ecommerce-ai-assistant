import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { computeOrderTotal, formatCents } from '../utils/pricing.js';

const STATUS_OPTIONS = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function AdminOrderDetailPage() {
  const { logout } = useAdminAuth();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [carrierInput, setCarrierInput] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);
  const [shippingEmailed, setShippingEmailed] = useState(false);
  const [shippingError, setShippingError] = useState(null);

  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundRestock, setRefundRestock] = useState(true);
  const [refundReason, setRefundReason] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOrder(null);
    fetch(`/api/admin/orders/${orderNumber}`)
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong looking up that order.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data);
        setSelectedStatus(data.status);
        setCarrierInput(data.carrier || '');
        setTrackingInput(data.tracking_number || '');
        // Pre-fill the refund amount with the order's real total (in
        // dollars, since the input is a plain number field, not a cents
        // field) - only meaningful pre-refund; already-refunded orders
        // show a read-only summary instead of this form entirely.
        if (!data.refunded_at) {
          const total = computeOrderTotal(data);
          if (total != null) setRefundAmountInput(String(total / 100));
        }
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
      if (res.status === 401) {
        logout();
        return;
      }
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

  async function processRefund() {
    setRefundSaving(true);
    setRefundError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: Math.round(Number(refundAmountInput) * 100),
          restock: refundRestock,
          reason: refundReason || null,
        }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong processing that refund.');
      }
      const updated = await res.json();
      setOrder(updated);
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setRefundSaving(false);
    }
  }

  async function saveShipping() {
    setShippingSaving(true);
    setShippingSaved(false);
    setShippingError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierInput, trackingNumber: trackingInput }),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong updating shipping info.');
      }
      const updated = await res.json();
      setOrder(updated);
      setShippingEmailed(Boolean(updated.emailed));
      setShippingSaved(true);
    } catch (err) {
      setShippingError(err.message);
    } finally {
      setShippingSaving(false);
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
  const hasAddress = Boolean(order.address_line1);

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

      <div className="admin-order-detail-shipping">
        <h2>Shipping</h2>

        {hasAddress ? (
          <div className="admin-order-detail-address">
            <span>{order.recipient_name}</span>
            <span>{order.address_line1}</span>
            {order.address_line2 && <span>{order.address_line2}</span>}
            <span>
              {order.city}, {order.state} {order.postal_code}
            </span>
            <span>{order.country}</span>
          </div>
        ) : (
          <p className="subtitle">No shipping address on file.</p>
        )}

        <label htmlFor="admin-order-carrier-input">Carrier</label>
        <input
          id="admin-order-carrier-input"
          type="text"
          value={carrierInput}
          onChange={(e) => setCarrierInput(e.target.value)}
        />
        <label htmlFor="admin-order-tracking-input">Tracking #</label>
        <input
          id="admin-order-tracking-input"
          type="text"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
        />
        <button type="button" onClick={saveShipping} disabled={shippingSaving}>
          {shippingSaving ? 'Saving...' : 'Save'}
        </button>

        {shippingSaved && (
          <p className="admin-order-detail-saved">
            {shippingEmailed ? 'Shipping info updated and customer notified.' : 'Shipping info updated.'}
          </p>
        )}
        {shippingError && (
          <p className="verify-error" role="alert">
            {shippingError}
          </p>
        )}

        {hasAddress ? (
          <div className="admin-order-detail-downloads">
            <a href={`/api/admin/orders/${orderNumber}/invoice.pdf`}>Download Invoice</a>
            <a href={`/api/admin/orders/${orderNumber}/packing-slip.pdf`}>Download Packing Slip</a>
          </div>
        ) : (
          <p className="subtitle">Downloads unavailable until this order has a shipping address.</p>
        )}
      </div>

      <div className="admin-order-detail-refund">
        <h2>Refund</h2>

        {order.refunded_at ? (
          <>
            <div className="admin-order-detail-field">
              <span>Refunded</span>
              <span>{formatCents(order.refund_amount_cents)}</span>
            </div>
            <div className="admin-order-detail-field">
              <span>Refunded on</span>
              <span>{dateFormatter.format(new Date(order.refunded_at))}</span>
            </div>
            <div className="admin-order-detail-field">
              <span>Restocked</span>
              <span>{order.restocked ? 'Yes' : 'No'}</span>
            </div>
            {order.refund_reason && (
              <div className="admin-order-detail-field">
                <span>Reason</span>
                <span>{order.refund_reason}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <label htmlFor="admin-order-refund-amount">Refund amount ($)</label>
            <input
              id="admin-order-refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={refundAmountInput}
              onChange={(e) => setRefundAmountInput(e.target.value)}
            />
            <label className="admin-order-detail-restock-row">
              <input
                type="checkbox"
                checked={refundRestock}
                onChange={(e) => setRefundRestock(e.target.checked)}
              />
              Restore item to stock
            </label>
            <label htmlFor="admin-order-refund-reason">Reason (optional)</label>
            <textarea
              id="admin-order-refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <button type="button" onClick={processRefund} disabled={refundSaving}>
              {refundSaving ? 'Processing...' : 'Process Refund'}
            </button>
            {refundError && (
              <p className="verify-error" role="alert">
                {refundError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
