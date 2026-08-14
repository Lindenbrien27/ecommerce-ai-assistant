import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminOrdersPage } from './AdminOrdersPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
          ],
          nextCursor: null,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders orders returned from the API', async () => {
  renderPage();
  expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
  expect(screen.getByText('jane@example.com')).toBeInTheDocument();
});

it('re-fetches with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });

  await waitFor(() => {
    const calledWithStatus = global.fetch.mock.calls.some(([url]) => String(url).includes('status=shipped'));
    expect(calledWithStatus).toBe(true);
  });
});

it('re-fetches with the search query when typed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/search orders/i), { target: { value: 'ORD-1001' } });

  await waitFor(() => {
    const calledWithQuery = global.fetch.mock.calls.some(([url]) => String(url).includes('q=ORD-1001'));
    expect(calledWithQuery).toBe(true);
  });
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up orders.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
