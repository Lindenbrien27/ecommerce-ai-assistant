import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', state: '', postal_code: '', country: '', phone: '' };

export function AddressPage() {
  const authorizedFetch = useAuthorizedFetch();
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/address');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your address.');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAddress({
            line1: data.line1 || '',
            line2: data.line2 || '',
            city: data.city || '',
            state: data.state || '',
            postal_code: data.postal_code || '',
            country: data.country || '',
            phone: data.phone || '',
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
    setAddress((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/address', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city,
          state: address.state || null,
          postal_code: address.postal_code,
          country: address.country,
          phone: address.phone || null,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your address.');
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
      const res = await authorizedFetch('/api/account/address', { method: 'DELETE' });
      if (res.status === 401) return;
      if (!res.ok && res.status !== 204) {
        setError('Something went wrong removing your address.');
        return;
      }
      setAddress(EMPTY_ADDRESS);
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!address && !error) return <p className="subtitle">Loading...</p>;

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {address && (
        <>
          <label className="settings-field">
            <span>Address line 1</span>
            <input type="text" required value={address.line1} onChange={(e) => updateField('line1', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Address line 2</span>
            <input type="text" value={address.line2} onChange={(e) => updateField('line2', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>City</span>
            <input type="text" required value={address.city} onChange={(e) => updateField('city', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>State / Province</span>
            <input type="text" value={address.state} onChange={(e) => updateField('state', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Postal code</span>
            <input type="text" required value={address.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} maxLength={20} />
          </label>

          <label className="settings-field">
            <span>Country</span>
            <input type="text" required value={address.country} onChange={(e) => updateField('country', e.target.value)} maxLength={200} />
          </label>

          <label className="settings-field">
            <span>Phone</span>
            <input type="tel" value={address.phone} onChange={(e) => updateField('phone', e.target.value)} maxLength={30} />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save address'}
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
