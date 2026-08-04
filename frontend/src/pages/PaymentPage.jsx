import { useCallback, useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { SettingsLayout } from '../components/SettingsLayout.jsx';
import { SettingsDropdown } from '../components/SettingsDropdown.jsx';

const BRAND_OPTIONS = [
  { value: 'Visa', label: 'Visa' },
  { value: 'Mastercard', label: 'Mastercard' },
  { value: 'Amex', label: 'Amex' },
  { value: 'Discover', label: 'Discover' },
];
const EMPTY_METHOD = { brand: '', last4: '', expiry_month: '', expiry_year: '', billing_name: '' };

export function PaymentPage() {
  const authorizedFetch = useAuthorizedFetch();
  const [method, setMethod] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authorizedFetch('/api/account/payment-method');
      if (res.status === 401) return;
      if (!res.ok) {
        setError('Something went wrong loading your payment method.');
        return;
      }
      const data = await res.json();
      setMethod({
        brand: data.brand || '',
        last4: data.last4 || '',
        expiry_month: data.expiry_month ?? '',
        expiry_year: data.expiry_year ?? '',
        billing_name: data.billing_name || '',
      });
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    load();
  }, [load]);

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear + i);

  return (
    <SettingsLayout>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
      {!method && !error && <p className="subtitle">Loading...</p>}

      {method && (
        <form className="settings-panel" onSubmit={handleSubmit}>
          <div className="settings-panel-head">
            <h2>Payment method</h2>
            <p>Only the card brand, last 4 digits, expiry, and billing name are stored - never a full card number or security code.</p>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Card brand</div>
            </div>
            <div className="settings-field-control">
              <SettingsDropdown
                id="payment-brand-select"
                value={method.brand}
                onChange={(value) => updateField('brand', value)}
                options={BRAND_OPTIONS}
                placeholder="Select a brand"
              />
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Last 4 digits</div>
            </div>
            <div className="settings-field-control">
              <input
                type="text"
                inputMode="numeric"
                required
                pattern="[0-9]{4}"
                maxLength={4}
                value={method.last4}
                onChange={(e) => updateField('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Expiry month</div>
            </div>
            <div className="settings-field-control">
              <select required value={method.expiry_month} onChange={(e) => updateField('expiry_month', e.target.value)}>
                <option value="">Month</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Expiry year</div>
            </div>
            <div className="settings-field-control">
              <select required value={method.expiry_year} onChange={(e) => updateField('expiry_year', e.target.value)}>
                <option value="">Year</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Billing name</div>
            </div>
            <div className="settings-field-control">
              <input
                type="text"
                required
                value={method.billing_name}
                onChange={(e) => updateField('billing_name', e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="settings-panel-actions">
            {savedAt && (
              <span className="settings-saved-note" role="status">
                Saved
              </span>
            )}
            <button type="button" className="settings-btn-secondary" onClick={handleRemove} disabled={saving}>
              Remove
            </button>
            <button type="submit" className="settings-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save payment method'}
            </button>
          </div>
        </form>
      )}
    </SettingsLayout>
  );
}
