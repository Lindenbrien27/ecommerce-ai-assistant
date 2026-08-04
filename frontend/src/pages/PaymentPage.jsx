import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Discover'];
const EMPTY_METHOD = { brand: '', last4: '', expiry_month: '', expiry_year: '', billing_name: '' };

export function PaymentPage() {
  const authorizedFetch = useAuthorizedFetch();
  const [method, setMethod] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/payment-method');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your payment method.');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setMethod({
            brand: data.brand || '',
            last4: data.last4 || '',
            expiry_month: data.expiry_month ?? '',
            expiry_year: data.expiry_year ?? '',
            billing_name: data.billing_name || '',
          });
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  function updateField(field, value) {
    setMethod((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/payment-method', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: method.brand,
          last4: method.last4,
          expiry_month: Number(method.expiry_month),
          expiry_year: Number(method.expiry_year),
          billing_name: method.billing_name,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your payment method.');
        return;
      }
      setSavedAt(new Date());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/payment-method', { method: 'DELETE' });
      if (res.status === 401) return;
      if (!res.ok && res.status !== 204) {
        setError('Something went wrong removing your payment method.');
        return;
      }
      setMethod(EMPTY_METHOD);
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!method && !error) return <p className="subtitle">Loading...</p>;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear + i);

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="settings-note">
        Only the card brand, last 4 digits, expiry, and billing name are stored - never a full card number or
        security code.
      </p>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {method && (
        <>
          <label className="settings-field">
            <span>Card brand</span>
            <select required value={method.brand} onChange={(e) => updateField('brand', e.target.value)}>
              <option value="">Select a brand</option>
              {BRAND_OPTIONS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Last 4 digits</span>
            <input
              type="text"
              inputMode="numeric"
              required
              pattern="[0-9]{4}"
              maxLength={4}
              value={method.last4}
              onChange={(e) => updateField('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>

          <label className="settings-field">
            <span>Expiry month</span>
            <select required value={method.expiry_month} onChange={(e) => updateField('expiry_month', e.target.value)}>
              <option value="">Month</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Expiry year</span>
            <select required value={method.expiry_year} onChange={(e) => updateField('expiry_year', e.target.value)}>
              <option value="">Year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Billing name</span>
            <input type="text" required value={method.billing_name} onChange={(e) => updateField('billing_name', e.target.value)} maxLength={100} />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save payment method'}
            </button>
            <button type="button" className="settings-remove-btn" onClick={handleRemove} disabled={saving}>
              Remove
            </button>
            {savedAt && (
              <span className="settings-saved-note" role="status">
                Saved
              </span>
            )}
          </div>
        </>
      )}
    </form>
  );
}
