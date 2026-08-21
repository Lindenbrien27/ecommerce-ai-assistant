import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const EMPTY_FORM = {
  slug: '',
  name: '',
  description: '',
  category: '',
  price_cents: '',
  original_price_cents: '',
  cover_image_url: '',
  icon: '',
  sku: '',
  stock_quantity: '',
};

export function AdminProductFormPage() {
  const { logout } = useAdminAuth();
  const { slug } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(slug);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    fetch(`/api/products/${slug}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading that product.');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setForm({
          slug: data.slug,
          name: data.name,
          description: data.description || '',
          category: data.category,
          price_cents: String(data.price_cents),
          original_price_cents: data.original_price_cents != null ? String(data.original_price_cents) : '',
          cover_image_url: data.cover_image_url || '',
          icon: data.icon || '',
          sku: data.sku,
          stock_quantity: String(data.stock_quantity),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, isEdit]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      description: form.description || null,
      category: form.category,
      price_cents: Number(form.price_cents),
      original_price_cents: form.original_price_cents ? Number(form.original_price_cents) : null,
      cover_image_url: form.cover_image_url || null,
      icon: form.icon || null,
      sku: form.sku,
      stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : 0,
    };
    if (!isEdit) body.slug = form.slug;

    try {
      const res = await fetch(isEdit ? `/api/admin/products/${slug}` : '/api/admin/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || 'Something went wrong saving that product.');
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {

    if (!window.confirm(`Delete ${form.name}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${slug}`, { method: 'DELETE' });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong deleting that product.');
      }
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="admin-product-form-page">
      <h1>{isEdit ? `Edit ${form.name}` : 'New Product'}</h1>

      <form onSubmit={handleSubmit}>
        {!isEdit && (
          <>
            <label htmlFor="admin-product-slug">Slug</label>
            <input
              id="admin-product-slug"
              type="text"
              value={form.slug}
              onChange={(e) => updateField('slug', e.target.value)}
              required
            />
          </>
        )}

        <label htmlFor="admin-product-name">Name</label>
        <input id="admin-product-name" type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />

        <label htmlFor="admin-product-description">Description</label>
        <input
          id="admin-product-description"
          type="text"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
        />

        <label htmlFor="admin-product-category">Category</label>
        <input
          id="admin-product-category"
          type="text"
          value={form.category}
          onChange={(e) => updateField('category', e.target.value)}
          required
        />

        <label htmlFor="admin-product-price">Price (cents)</label>
        <input
          id="admin-product-price"
          type="number"
          min="0"
          value={form.price_cents}
          onChange={(e) => updateField('price_cents', e.target.value)}
          required
        />

        <label htmlFor="admin-product-original-price">Original price (cents, optional)</label>
        <input
          id="admin-product-original-price"
          type="number"
          min="0"
          value={form.original_price_cents}
          onChange={(e) => updateField('original_price_cents', e.target.value)}
        />

        <label htmlFor="admin-product-cover-image">Cover image URL</label>
        <input
          id="admin-product-cover-image"
          type="text"
          value={form.cover_image_url}
          onChange={(e) => updateField('cover_image_url', e.target.value)}
        />

        <label htmlFor="admin-product-icon">Icon key</label>
        <input id="admin-product-icon" type="text" value={form.icon} onChange={(e) => updateField('icon', e.target.value)} />

        <label htmlFor="admin-product-sku">SKU</label>
        <input id="admin-product-sku" type="text" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} required />

        <label htmlFor="admin-product-stock">Stock quantity</label>
        <input
          id="admin-product-stock"
          type="number"
          min="0"
          value={form.stock_quantity}
          onChange={(e) => updateField('stock_quantity', e.target.value)}
        />

        <div className="admin-product-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isEdit && (
            <button type="button" className="admin-product-delete-btn" onClick={handleDelete} disabled={saving}>
              Delete Product
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
