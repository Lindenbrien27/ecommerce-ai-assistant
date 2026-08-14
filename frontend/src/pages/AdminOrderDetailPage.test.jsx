import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminOrderDetailPage } from './AdminOrderDetailPage.jsx';

const ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  status: 'shipped',
  carrier: 'UPS',
  tracking_number: '1Z999',
  created_at: '2026-01-01T00:00:00Z',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
};

function renderPage(orderNumber = 'ORD-1001') {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[`/admin/orders/${orderNumber}`]}>
        <Routes>
          <Route path="/admin/orders/:orderNumber" element={<AdminOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/NOPE') {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Order not found' }) });
    }
    if (url === '/api/admin/orders/ORD-1001/status' && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...ORDER, status: 'delivered' }) });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders the order detail fields', async () => {
  renderPage();
  expect(await screen.findByText('Sneakers')).toBeInTheDocument();
  expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  expect(screen.getByText('UPS')).toBeInTheDocument();
});

it('shows a not-found message for an unknown order', async () => {
  renderPage('NOPE');
  expect(await screen.findByRole('alert')).toHaveTextContent(/order not found/i);
});

it('updates the status and reflects the new value on success', async () => {
  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/change status/i), { target: { value: 'delivered' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/orders/ORD-1001/status',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'delivered' }) })
    );
  });
  expect(await screen.findByText(/status updated/i)).toBeInTheDocument();
});

it('surfaces an error when the status update fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (opts?.method === 'PATCH') {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong updating that order.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
