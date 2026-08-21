
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminCustomersPage } from './AdminCustomersPage.jsx';

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminCustomersPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/customers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          customers: [
            {
              customer_email: 'jane.doe@example.com',
              order_count: 3,
              total_spent_cents: 15000,
              last_order_at: '2026-07-24T00:00:00Z',
            },
          ],
          hasMore: false,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders customers returned from the API', async () => {
  renderPage();
  expect(await screen.findByText('jane.doe@example.com')).toBeInTheDocument();
  expect(screen.getByText('$150.00')).toBeInTheDocument();
});

it('links each row to the customer detail page with an encoded email', async () => {
  renderPage();
  await screen.findByText('jane.doe@example.com');
  expect(screen.getByRole('link', { name: /jane\.doe@example\.com/i })).toHaveAttribute(
    'href',
    '/admin/customers/jane.doe%40example.com'
  );
});

it('re-fetches with the search query when typed', async () => {
  renderPage();
  await screen.findByText('jane.doe@example.com');

  fireEvent.change(screen.getByLabelText(/search customers/i), { target: { value: 'jane' } });

  await waitFor(() => {
    const calledWithQuery = global.fetch.mock.calls.some(([url]) => String(url).includes('q=jane'));
    expect(calledWithQuery).toBe(true);
  });
});

it('shows Load more when hasMore is true and appends the next page', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).includes('page=2')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          customers: [
            {
              customer_email: 'john.smith@example.com',
              order_count: 1,
              total_spent_cents: 5000,
              last_order_at: '2026-07-20T00:00:00Z',
            },
          ],
          hasMore: false,
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        customers: [
          {
            customer_email: 'jane.doe@example.com',
            order_count: 3,
            total_spent_cents: 15000,
            last_order_at: '2026-07-24T00:00:00Z',
          },
        ],
        hasMore: true,
      }),
    });
  });

  renderPage();
  await screen.findByText('jane.doe@example.com');
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));

  expect(await screen.findByText('john.smith@example.com')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up customers.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
