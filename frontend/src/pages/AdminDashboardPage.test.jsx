import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminDashboardPage } from './AdminDashboardPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

// Every value here is deliberately distinct from every other value (3
// orders, not 1, so total revenue != average order value; the one
// product's revenue/units differ from both) - a fixture where two of
// these coincidentally matched would make screen.getByText ambiguous
// (multiple elements sharing the same text), since nothing here is
// scoped to one card or table cell.
const STATS = {
  total_revenue_cents: 50000,
  total_orders: 3,
  average_order_value_cents: 16667,
  top_products: [
    { product_name: 'Wireless Noise-Cancelling Headphones', product_icon: 'headphones', revenue_cents: 16798, units_sold: 2 },
  ],
};

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/dashboard') return Promise.resolve({ ok: true, json: async () => STATS });
    return Promise.resolve({ ok: false });
  });
});

it('renders the three stat cards with formatted values', async () => {
  renderPage();
  expect(await screen.findByText('$500.00')).toBeInTheDocument(); // total revenue
  expect(screen.getByText('3')).toBeInTheDocument(); // total orders
  expect(screen.getByText('$166.67')).toBeInTheDocument(); // average order value (50000 / 3, rounded)
});

it('renders the top products table', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument(); // units sold
  expect(screen.getByText('$167.98')).toBeInTheDocument(); // product revenue
});

it('shows the empty state when there are no orders yet', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/dashboard') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ total_revenue_cents: 0, total_orders: 0, average_order_value_cents: 0, top_products: [] }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading the dashboard.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the dashboard fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (url === '/api/admin/dashboard') {
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

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
