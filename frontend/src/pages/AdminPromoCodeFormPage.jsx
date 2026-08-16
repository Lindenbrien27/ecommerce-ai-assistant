import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const EMPTY_FORM = {
  code: '',
  discount_type: 'percentage',
  discount_value: '',
  usage_limit: '',
  expires_at: '',
  active: true,
};

export function AdminPromoCodeFormPage() {
  const { logout } = useAdminAuth();
  const { code: editCode } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editCode);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // No single-code admin GET exists (see this task's own Interfaces note)
  // - the edit variant loads the full list (the same endpoint the list
  // page already uses) and finds the matching row client-side.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    fetch('/api/admin/promo-codes')
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) logout();
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading that promo code.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const existing = data.find((c) => c.code === editCode);
        if (!existing) {
          throw new Error('Promo code not found.');
        }
        setForm({
          code: existing.code,
          discount_type: existing.discount_type,
          discount_value: String(existing.discount_value),
          usage_limit: existing.usage_limit != null ? String(existing.usage_limit) : '',
          expires_at: existing.expires_at ? existing.expires_at.slice(0, 10) : '',
          active: existing.active,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editCode, isEdit, logout]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      expires_at: form.expires_at || null,
      active: form.active,
    };
    if (!isEdit) body.code = form.code;

    try {
      const res = await fetch(
        isEdit ? `/api/admin/promo-codes/${encodeURIComponent(editCode)}` : '/api/admin/promo-codes',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || 'Something went wrong saving that promo code.');
      }
      navigate('/admin/promo-codes');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${form.code}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promo-codes/${encodeURIComponent(editCode)}`, { method: 'DELETE' });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong deleting that promo code.');
      }
      navigate('/admin/promo-codes');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="admin-promo-code-form-page">
      <h1>{isEdit ? `Edit ${form.code}` : 'New Promo Code'}</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor="admin-promo-code-code">Code</label>
        <input
          id="admin-promo-code-code"
          type="text"
          value={form.code}
          onChange={(e) => updateField('code', e.target.value)}
          disabled={isEdit}
          required
        />

        <label htmlFor="admin-promo-code-type">Discount Type</label>
        <select
          id="admin-promo-code-type"
          value={form.discount_type}
          onChange={(e) => updateField('discount_type', e.target.value)}
        >
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed amount (cents)</option>
        </select>

        <label htmlFor="admin-promo-code-value">Discount Value</label>
        <input
          id="admin-promo-code-value"
          type="number"
          min="1"
          value={form.discount_value}
          onChange={(e) => updateField('discount_value', e.target.value)}
          required
        />

        <label htmlFor="admin-promo-code-usage-limit">Usage Limit (optional)</label>
        <input
          id="admin-promo-code-usage-limit"
          type="number"
          min="1"
          value={form.usage_limit}
          onChange={(e) => updateField('usage_limit', e.target.value)}
        />

        <label htmlFor="admin-promo-code-expires">Expires (optional, UTC midnight)</label>
        <input
          id="admin-promo-code-expires"
          type="date"
          value={form.expires_at}
          onChange={(e) => updateField('expires_at', e.target.value)}
        />

        {isEdit && (
          <label className="admin-promo-code-active-row">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => updateField('active', e.target.checked)}
            />
            Active
          </label>
        )}

        <div className="admin-promo-code-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isEdit && (
            <button type="button" className="admin-promo-code-delete-btn" onClick={handleDelete} disabled={saving}>
              Delete Code
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
