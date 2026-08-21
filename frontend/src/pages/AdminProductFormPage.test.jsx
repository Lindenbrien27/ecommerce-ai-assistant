import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductFormPage } from './AdminProductFormPage.jsx';

const EXISTING_PRODUCT = {
  slug: 'headphones',
  name: 'Wireless Noise-Cancelling Headphones',
  description: 'Over-ear comfort.',
  category: 'Audio',
  price_cents: 14999,
  original_price_cents: null,
  cover_image_url: null,
  icon: 'headphones',
  sku: 'AUD-HP-001',
  stock_quantity: 42,
  colorways: [],
};

function renderForm(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:slug/edit" element={<AdminProductFormPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders an empty form for a new product', async () => {
  renderForm('/admin/products/new');
  expect(await screen.findByLabelText(/^name$/i)).toHaveValue('');
  expect(screen.getByLabelText(/^slug$/i)).toBeInTheDocument();
});

it('pre-fills the form with the existing product on edit', async () => {
  renderForm('/admin/products/headphones/edit');
  expect(await screen.findByLabelText(/^name$/i)).toHaveValue('Wireless Noise-Cancelling Headphones');
  expect(screen.getByLabelText(/^sku$/i)).toHaveValue('AUD-HP-001');
  expect(screen.queryByLabelText(/^slug$/i)).not.toBeInTheDocument();
});

it('submits a POST with the entered fields when creating', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/products' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ slug: 'new-item' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/new');
  await screen.findByLabelText(/^name$/i);
  fireEvent.change(screen.getByLabelText(/^slug$/i), { target: { value: 'new-item' } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'New Item' } });
  fireEvent.change(screen.getByLabelText(/^category$/i), { target: { value: 'Accessories' } });
  fireEvent.change(screen.getByLabelText(/price \(cents\)/i), { target: { value: '1999' } });
  fireEvent.change(screen.getByLabelText(/^sku$/i), { target: { value: 'ACC-NI-999' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u]) => u === '/api/admin/products');
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ slug: 'new-item', name: 'New Item', category: 'Accessories', price_cents: 1999, sku: 'ACC-NI-999' });
  });
});

it('submits a PATCH when editing an existing product', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    if (url === '/api/admin/products/headphones' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...EXISTING_PRODUCT, name: 'Updated Name' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/headphones/edit');
  await screen.findByDisplayValue('Wireless Noise-Cancelling Headphones');
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Updated Name' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/products/headphones' && o?.method === 'PATCH');
    expect(call).toBeTruthy();
  });
});

it('deletes the product when Delete is clicked and the confirmation is accepted', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    if (url === '/api/admin/products/headphones' && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });

  vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderForm('/admin/products/headphones/edit');
  await screen.findByDisplayValue('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /delete product/i }));

  expect(window.confirm).toHaveBeenCalledWith('Delete Wireless Noise-Cancelling Headphones? This cannot be undone.');

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/products/headphones' && o?.method === 'DELETE');
    expect(call).toBeTruthy();
  });
});

it('does not delete the product when the confirmation is dismissed', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/products/headphones' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_PRODUCT });
    }
    if (url === '/api/admin/products/headphones' && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(false);

  renderForm('/admin/products/headphones/edit');
  await screen.findByDisplayValue('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /delete product/i }));

  expect(window.confirm).toHaveBeenCalled();
  const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/products/headphones' && o?.method === 'DELETE');
  expect(call).toBeFalsy();
});

it('surfaces an error when saving fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (opts?.method === 'POST') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'sku already exists.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/products/new');
  await screen.findByLabelText(/^name$/i);
  fireEvent.change(screen.getByLabelText(/^slug$/i), { target: { value: 'dup' } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Dup' } });
  fireEvent.change(screen.getByLabelText(/^category$/i), { target: { value: 'Accessories' } });
  fireEvent.change(screen.getByLabelText(/price \(cents\)/i), { target: { value: '1000' } });
  fireEvent.change(screen.getByLabelText(/^sku$/i), { target: { value: 'DUP-1' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/sku already exists/i);
});
