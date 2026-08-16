import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminPromoCodeFormPage } from './AdminPromoCodeFormPage.jsx';

const EXISTING_CODES = [
  { code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: 100, usage_count: 12, expires_at: '2026-12-31T00:00:00Z', active: true },
];

function renderForm(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/promo-codes/new" element={<AdminPromoCodeFormPage />} />
          <Route path="/admin/promo-codes/:code/edit" element={<AdminPromoCodeFormPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders an empty form for a new code', async () => {
  renderForm('/admin/promo-codes/new');
  expect(await screen.findByLabelText(/^code$/i)).toHaveValue('');
});

it('pre-fills the form with the existing code on edit', async () => {
  renderForm('/admin/promo-codes/SPRING15/edit');
  expect(await screen.findByLabelText(/^code$/i)).toHaveValue('SPRING15');
  expect(screen.getByLabelText(/discount value/i)).toHaveValue(15);
  expect(screen.getByLabelText(/^code$/i)).toBeDisabled();
});

it('shows a not-found error on edit when the code is missing from the list', async () => {
  renderForm('/admin/promo-codes/NOPE/edit');
  expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
});

it('submits a POST with the entered fields when creating', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ code: 'NEWCODE' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/new');
  await screen.findByLabelText(/^code$/i);
  fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'newcode' } });
  fireEvent.change(screen.getByLabelText(/discount type/i), { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes' && o?.method === 'POST');
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ code: 'newcode', discount_type: 'fixed', discount_value: 500 });
  });
});

it('submits a PATCH when editing an existing code', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    if (url === '/api/admin/promo-codes/SPRING15' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...EXISTING_CODES[0], discount_value: 20 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/SPRING15/edit');
  await screen.findByDisplayValue('SPRING15');
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes/SPRING15' && o?.method === 'PATCH');
    expect(call).toBeTruthy();
  });
});

it('deletes the code when Delete is clicked and the confirmation is accepted', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes' && !opts) {
      return Promise.resolve({ ok: true, json: async () => EXISTING_CODES });
    }
    if (url === '/api/admin/promo-codes/SPRING15' && opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderForm('/admin/promo-codes/SPRING15/edit');
  await screen.findByDisplayValue('SPRING15');
  fireEvent.click(screen.getByRole('button', { name: /delete code/i }));

  expect(window.confirm).toHaveBeenCalledWith('Delete SPRING15? This cannot be undone.');

  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([u, o]) => u === '/api/admin/promo-codes/SPRING15' && o?.method === 'DELETE');
    expect(call).toBeTruthy();
  });
});

it('surfaces an error when saving fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (opts?.method === 'POST') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'code already exists.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderForm('/admin/promo-codes/new');
  await screen.findByLabelText(/^code$/i);
  fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'DUP' } });
  fireEvent.change(screen.getByLabelText(/discount value/i), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/code already exists/i);
});
