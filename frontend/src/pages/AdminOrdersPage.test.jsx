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

it('ignores a stale "load more" response if the filter changes before it resolves', async () => {
  const initialOrders = [
    { order_number: 'ORD-1001', customer_email: 'jane@example.com', product_name: 'Sneakers', status: 'shipped', created_at: '2026-01-01T00:00:00Z' },
  ];
  const filteredOrders = [
    { order_number: 'ORD-2002', customer_email: 'bob@example.com', product_name: 'Boots', status: 'delivered', created_at: '2026-01-02T00:00:00Z' },
  ];
  const staleOrders = [
    { order_number: 'ORD-9999', customer_email: 'stale@example.com', product_name: 'Stale Item', status: 'shipped', created_at: '2026-01-03T00:00:00Z' },
  ];

  let resolveLoadMore;
  let fetchCallCount = 0;

  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    fetchCallCount += 1;

    // Call 1: initial page-1 fetch on mount.
    if (fetchCallCount === 1) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ orders: initialOrders, nextCursor: 'cursor-1' }),
      });
    }

    // Call 2: the "Load more" fetch, deliberately left pending so the test
    // can change the filter before it resolves.
    if (fetchCallCount === 2) {
      return new Promise((resolve) => {
        resolveLoadMore = () =>
          resolve({
            ok: true,
            json: async () => ({ orders: staleOrders, nextCursor: 'stale-cursor' }),
          });
      });
    }

    // Call 3: the re-fetch triggered by the status filter change.
    return Promise.resolve({
      ok: true,
      json: async () => ({ orders: filteredOrders, nextCursor: null }),
    });
  });

  renderPage();
  await screen.findByText('ORD-1001');

  fireEvent.click(screen.getByRole('button', { name: /load more/i }));

  // Change the filter while the "load more" request is still in flight.
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'delivered' } });

  await screen.findByText('ORD-2002');

  // Now let the stale "load more" response land, and flush the promise
  // chain (data = await res.json(); then setOrders/setNextCursor) past a
  // macrotask boundary so a would-be bad update has had its chance to
  // apply before we assert it didn't. A waitFor() checking absence here
  // would pass trivially on its very first (synchronous) check, before
  // the .then/await chain has run at all - it wouldn't actually prove
  // anything.
  await act(async () => {
    resolveLoadMore();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(screen.queryByText('ORD-9999')).not.toBeInTheDocument();
  expect(screen.getByText('ORD-2002')).toBeInTheDocument();
  expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
});
