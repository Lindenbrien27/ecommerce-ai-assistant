import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
          total: 1,
          page: 1,
          pageSize: 10,
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

it('computes and displays the order total from pricing fields', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            {
              order_number: 'ORD-1001',
              customer_email: 'jane@example.com',
              product_name: 'Sneakers',
              status: 'shipped',
              created_at: '2026-01-01T00:00:00Z',
              unit_price_cents: 14999,
              delivery_cost_cents: 599,
              vat_cents: 1200,
              voucher_cents: 0,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('$167.98')).toBeInTheDocument();
});

it('shows an em dash in the Total column when an order has no pricing data', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            {
              order_number: 'ORD-1001',
              customer_email: 'jane@example.com',
              product_name: 'Sneakers',
              status: 'shipped',
              created_at: '2026-01-01T00:00:00Z',
              unit_price_cents: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('ORD-1001');
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('shows the empty-filters message when no orders match', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 0, page: 1, pageSize: 10 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No orders match these filters.')).toBeInTheDocument();
});

it('re-fetches page 1 with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('status=shipped') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('re-fetches page 1 with the search query when typed', async () => {
  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.change(screen.getByLabelText(/search orders/i), { target: { value: 'ORD-1001' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('q=ORD-1001') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
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

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/orders')) {
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

it('shows numbered page buttons and refetches page 2 on click', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 25, page: 1, pageSize: 10 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('page=2'));
    expect(called).toBe(true);
  });
});

it('resets to page 1 and refetches with the new page size when rows-per-page changes', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 60, page: 1, pageSize: 10 }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/rows per page/i)).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/rows per page/i), { target: { value: '25' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('pageSize=25') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('Clear resets status and search, and is disabled with no active filters', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled());

  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'shipped' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /clear/i })).not.toBeDisabled());
  await waitFor(() => {
    const filteredCallMade = global.fetch.mock.calls.some(([url]) => String(url).includes('status=shipped'));
    expect(filteredCallMade).toBe(true);
  });

  const callsBeforeClear = global.fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /clear/i }));

  expect(screen.getByLabelText(/filter by status/i).value).toBe('');
  await waitFor(() => {
    const callsAfterClear = global.fetch.mock.calls.slice(callsBeforeClear);
    const clearedCallMade = callsAfterClear.some(([url]) => !String(url).includes('status='));
    expect(clearedCallMade).toBe(true);
  });
});

it('logs out on a 401 when changing page', async () => {
  const initialOrders = [
    { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
  ];
  let fetchCallCount = 0;

  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/orders')) {
      fetchCallCount += 1;
      if (fetchCallCount === 1) {
        return Promise.resolve({ ok: true, json: async () => ({ orders: initialOrders, total: 25, page: 1, pageSize: 10 }) });
      }
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(
      ([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST'
    );
    expect(loggedOut).toBe(true);
  });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('ignores a stale page-2 response if the filter changes before it resolves', async () => {
  const initialOrders = [
    { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
  ];
  const filteredOrders = [
    { order_number: 'ORD-2002', customer_email: 'bob@example.com', product_name: 'Boots', status: 'delivered', created_at: '2026-01-02T00:00:00Z' },
  ];
  const staleOrders = [
    { order_number: 'ORD-9999', customer_email: 'stale@example.com', product_name: 'Stale Item', status: 'shipped', created_at: '2026-01-03T00:00:00Z' },
  ];

  let resolvePageTwo;
  let fetchCallCount = 0;

  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    fetchCallCount += 1;

    // Call 1: initial page-1 fetch on mount.
    if (fetchCallCount === 1) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ orders: initialOrders, total: 25, page: 1, pageSize: 10 }),
      });
    }

    // Call 2: the page-2 fetch, deliberately left pending so the test can
    // change the filter before it resolves.
    if (fetchCallCount === 2) {
      return new Promise((resolve) => {
        resolvePageTwo = () =>
          resolve({
            ok: true,
            json: async () => ({ orders: staleOrders, total: 25, page: 2, pageSize: 10 }),
          });
      });
    }

    // Call 3: the re-fetch triggered by the status filter change (resets to page 1).
    return Promise.resolve({
      ok: true,
      json: async () => ({ orders: filteredOrders, total: 1, page: 1, pageSize: 10 }),
    });
  });

  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.click(screen.getByRole('button', { name: '2' }));

  // Change the filter while the page-2 request is still in flight.
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'delivered' } });

  await screen.findByText('ORD-2002');

  // Now let the stale page-2 response land, and flush the promise chain
  // past a macrotask boundary so a would-be bad update has had its chance
  // to apply before we assert it didn't.
  await act(async () => {
    resolvePageTwo();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(screen.queryByText('ORD-9999')).not.toBeInTheDocument();
  expect(screen.getByText('ORD-2002')).toBeInTheDocument();
  expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
});
