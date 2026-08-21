import { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';
import { Button } from './ui/button.jsx';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldSeparator } from './ui/field.jsx';
import { Input } from './ui/input.jsx';
import { AdminProductPhotoUpload } from './AdminProductPhotoUpload.jsx';
import { formatCents } from '../utils/pricing.js';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet.jsx';

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
  spec_color: '',
  spec_size: '',
  spec_material: '',
};

// Same threshold AdminProductsPage.jsx's own stockBadge uses - duplicated

function previewStockBadge(stockQuantity) {
  const n = Number(stockQuantity);
  if (!stockQuantity || n <= 0) return { className: 'out-of-stock', label: 'Out of Stock' };
  if (n < 10) return { className: 'low-stock', label: 'Low Stock' };
  return { className: 'in-stock', label: 'In Stock' };
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function AdminNewProductSheet({ onCreated }) {
  const { logout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateName(value) {
    setForm((prev) => ({ ...prev, name: value, slug: slugTouched ? prev.slug : slugify(value) }));
  }

  function updateSlug(value) {
    setSlugTouched(true);
    updateField('slug', value);
  }

  function handleOpenChange(next) {
    setOpen(next);
    if (!next) {
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setError(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      slug: form.slug,
      name: form.name,
      description: form.description || null,
      category: form.category,
      price_cents: Number(form.price_cents),
      original_price_cents: form.original_price_cents ? Number(form.original_price_cents) : null,
      cover_image_url: form.cover_image_url || null,
      icon: form.icon || null,
      sku: form.sku,
      stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : 0,
      specs: {
        ...(form.spec_color ? { color: form.spec_color } : {}),
        ...(form.spec_size ? { size: form.spec_size } : {}),
        ...(form.spec_material ? { material: form.spec_material } : {}),
      },
    };

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
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
      onCreated?.();
      handleOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const badge = previewStockBadge(form.stock_quantity);
  const hasDiscount = form.original_price_cents !== '' && Number(form.original_price_cents) > Number(form.price_cents || 0);
  const specLine = [form.spec_color, form.spec_size, form.spec_material].filter(Boolean).join(' · ');

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={<button type="button" className="admin-products-new-link" />}>
        New Product
      </SheetTrigger>
      {/* dark flips every shadcn CSS var to its dark-mode value (the
          standard shadcn convention - see that component's own --background/
          --foreground etc.); admin-shop-sheet then retunes those same
          vars to this app's ink/brass palette instead of shadcn's default
          neutral dark, so the sheet matches the page it opens from. Wider
          than before (was 35vw/420px) - the live preview column needs the
          extra room; below lg it drops out and the form alone fits the
          old width fine. */}
      <SheetContent className="dark admin-shop-sheet w-full sm:max-w-none sm:w-[38vw] sm:min-w-[440px] lg:w-[58vw] lg:min-w-[760px]">
        <SheetHeader>
          <SheetTitle>New Product</SheetTitle>
          <SheetDescription>Add a new product to the catalog.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>Identity</FieldLegend>
                  <Field>
                    <FieldLabel htmlFor="admin-product-name">Name</FieldLabel>
                    <Input id="admin-product-name" value={form.name} onChange={(e) => updateName(e.target.value)} required />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="admin-product-slug">Slug</FieldLabel>
                      <Input
                        id="admin-product-slug"
                        className="font-mono"
                        value={form.slug}
                        onChange={(e) => updateSlug(e.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="admin-product-category">Category</FieldLabel>
                      <Input
                        id="admin-product-category"
                        value={form.category}
                        onChange={(e) => updateField('category', e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="admin-product-description">Description</FieldLabel>
                    <Input
                      id="admin-product-description"
                      value={form.description}
                      onChange={(e) => updateField('description', e.target.value)}
                    />
                  </Field>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Photo</FieldLegend>
                  <Field>
                    <FieldLabel htmlFor="admin-product-cover-image">Cover photo</FieldLabel>
                    <AdminProductPhotoUpload
                      value={form.cover_image_url}
                      onChange={(url) => updateField('cover_image_url', url)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="admin-product-icon">Icon key (fallback when no photo)</FieldLabel>
                    <Input id="admin-product-icon" value={form.icon} onChange={(e) => updateField('icon', e.target.value)} />
                  </Field>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Pricing &amp; stock</FieldLegend>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="admin-product-price">Price (cents)</FieldLabel>
                      <Input
                        id="admin-product-price"
                        type="number"
                        min="0"
                        value={form.price_cents}
                        onChange={(e) => updateField('price_cents', e.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="admin-product-original-price">Original price (optional)</FieldLabel>
                      <Input
                        id="admin-product-original-price"
                        type="number"
                        min="0"
                        value={form.original_price_cents}
                        onChange={(e) => updateField('original_price_cents', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="admin-product-sku">SKU</FieldLabel>
                      <Input id="admin-product-sku" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="admin-product-stock">Stock quantity</FieldLabel>
                      <Input
                        id="admin-product-stock"
                        type="number"
                        min="0"
                        value={form.stock_quantity}
                        onChange={(e) => updateField('stock_quantity', e.target.value)}
                      />
                    </Field>
                  </div>
                </FieldSet>

                <FieldSeparator />

                <FieldSet>
                  <FieldLegend>Specs (optional)</FieldLegend>
                  <div className="grid grid-cols-3 gap-3">
                    <Field>
                      <FieldLabel htmlFor="admin-product-spec-color">Color</FieldLabel>
                      <Input
                        id="admin-product-spec-color"
                        value={form.spec_color}
                        onChange={(e) => updateField('spec_color', e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="admin-product-spec-size">Size</FieldLabel>
                      <Input
                        id="admin-product-spec-size"
                        value={form.spec_size}
                        onChange={(e) => updateField('spec_size', e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="admin-product-spec-material">Material</FieldLabel>
                      <Input
                        id="admin-product-spec-material"
                        value={form.spec_material}
                        onChange={(e) => updateField('spec_material', e.target.value)}
                      />
                    </Field>
                  </div>
                </FieldSet>
              </FieldGroup>
            </div>

            {}
            <div className="admin-product-preview hidden lg:flex w-72 shrink-0 flex-col border-l p-4">
              <p className="admin-product-preview-label">Preview</p>
              <div className="admin-product-preview-card">
                <div className="admin-product-preview-media">
                  {form.cover_image_url ? (
                    <img src={form.cover_image_url} alt="" />
                  ) : (
                    <span className="admin-product-preview-media-empty">No photo</span>
                  )}
                </div>
                <p className="admin-product-preview-category">{form.category || 'Category'}</p>
                <p className="admin-product-preview-name">{form.name || 'Product name'}</p>
                {specLine && <p className="admin-product-preview-specs">{specLine}</p>}
                <p className="admin-product-preview-price">
                  {form.price_cents !== '' ? formatCents(Number(form.price_cents)) : '$0.00'}
                  {hasDiscount && (
                    <span className="admin-product-preview-price-was">{formatCents(Number(form.original_price_cents))}</span>
                  )}
                </p>
                <span className={`admin-inventory-stock-badge ${badge.className}`}>{badge.label}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="verify-error px-4" role="alert">
              {error}
            </p>
          )}

          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
