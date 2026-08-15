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
  recipient_name: 'Jane Doe',
  address_line1: '482 Maple Street',
  address_line2: null,
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  country: 'US',
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
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[0]);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/orders/ORD-1001/status',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'delivered' }) })
    );
  });
  expect(await screen.findByText(/status updated/i)).toBeInTheDocument();
});

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the order fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (url === '/api/admin/orders/ORD-1001' && (!opts || opts.method === undefined)) {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });

  // A 401 should route the admin to sign in again, not show a generic error.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('logs out on a 401 from the status update', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (opts?.method === 'PATCH') {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[0]);

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[0]);

  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('renders the shipping address when present', async () => {
  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByText('482 Maple Street')).toBeInTheDocument();
  expect(screen.getByText(/Austin, TX 78701/)).toBeInTheDocument();
});

it('shows "No shipping address on file" and hides downloads when there is none', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ({ ...ORDER, address_line1: null }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByText(/no shipping address on file/i)).toBeInTheDocument();
  expect(screen.queryByText(/download invoice/i)).not.toBeInTheDocument();
});

it('shows the invoice and packing-slip download links pointing at the right URLs when an address exists', async () => {
  renderPage();
  await screen.findByText('Sneakers');
  expect(screen.getByRole('link', { name: /download invoice/i })).toHaveAttribute(
    'href',
    '/api/admin/orders/ORD-1001/invoice.pdf'
  );
  expect(screen.getByRole('link', { name: /download packing slip/i })).toHaveAttribute(
    'href',
    '/api/admin/orders/ORD-1001/packing-slip.pdf'
  );
});

it('updates shipping info and shows the emailed confirmation when the response says emailed:true', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/shipping' && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, carrier: 'UPS', tracking_number: '1Z999', emailed: true }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/^carrier$/i), { target: { value: 'UPS' } });
  fireEvent.change(screen.getByLabelText(/tracking #/i), { target: { value: '1Z999' } });
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/orders/ORD-1001/shipping',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999' }) })
    );
  });
  expect(await screen.findByText(/updated and customer notified/i)).toBeInTheDocument();
});

it('shows the plain confirmation when the response says emailed:false', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (url === '/api/admin/orders/ORD-1001/shipping' && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...ORDER, carrier: 'UPS', tracking_number: '1Z999', emailed: false }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');

  fireEvent.change(screen.getByLabelText(/^carrier$/i), { target: { value: 'UPS' } });
  fireEvent.change(screen.getByLabelText(/tracking #/i), { target: { value: '1Z999' } });
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  const confirmation = await screen.findByText(/shipping info updated/i);
  expect(confirmation).not.toHaveTextContent(/notified/i);
});

it('surfaces an error when the shipping update fails', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/orders/ORD-1001' && !opts) {
      return Promise.resolve({ ok: true, json: async () => ORDER });
    }
    if (opts?.method === 'PATCH' && url.endsWith('/shipping')) {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'carrier and trackingNumber are required.' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('Sneakers');
  fireEvent.click(screen.getAllByRole('button', { name: /save/i })[1]);

  expect(await screen.findByRole('alert')).toHaveTextContent(/carrier and trackingnumber are required/i);
});
