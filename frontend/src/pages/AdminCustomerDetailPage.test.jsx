import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminCustomerDetailPage } from './AdminCustomerDetailPage.jsx';

const CUSTOMER = {
  email: 'jane.doe@example.com',
  orderCount: 2,
  totalSpentCents: 30000,
  lastOrderAt: '2026-07-24T00:00:00Z',
  orders: [
    {
      order_number: 'ORD-1001',
      customer_email: 'jane.doe@example.com',
      product_name: 'Wireless Headphones',
      status: 'shipped',
      created_at: '2026-07-24T00:00:00Z',
      recipient_name: 'Jane Doe',
      address_line1: '482 Maple Street',
      address_line2: null,
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
    },
  ],
  nextCursor: null,
};

function renderPage(email = 'jane.doe@example.com') {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[`/admin/customers/${email}`]}>
        <Routes>
          <Route path="/admin/customers/:email" element={<AdminCustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === `/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`) {
      return Promise.resolve({ ok: true, json: async () => CUSTOMER });
    }
    if (url === `/api/admin/customers/${encodeURIComponent('nobody@example.com')}`) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Customer not found' }) });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders contact info from the most recent order', async () => {
  renderPage();
  expect(await screen.findByText('482 Maple Street')).toBeInTheDocument();
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
});

it('renders the aggregate stats', async () => {
  renderPage();
  await screen.findByText('482 Maple Street');
  expect(screen.getByText('$300.00')).toBeInTheDocument();
});

it('renders the order list linking to the order detail page', async () => {
  renderPage();
  await screen.findByText('482 Maple Street');
  expect(screen.getByRole('link', { name: /ORD-1001/i })).toHaveAttribute('href', '/admin/orders/ORD-1001');
});

it('shows a not-found message for an unknown customer', async () => {
  renderPage('nobody@example.com');
  expect(await screen.findByRole('alert')).toHaveTextContent(/customer not found/i);
});

it('loads more orders via the pagination endpoint', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === `/api/admin/customers/${encodeURIComponent('jane.doe@example.com')}`) {
      return Promise.resolve({ ok: true, json: async () => ({ ...CUSTOMER, nextCursor: 'abc123' }) });
    }
    if (String(url).includes('/orders?cursor=abc123')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          orders: [
            {
              order_number: 'ORD-1002',
              product_name: 'USB-C Cable',
              status: 'delivered',
              created_at: '2026-07-10T00:00:00Z',
            },
          ],
          nextCursor: null,
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  await screen.findByText('482 Maple Street');
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));

  expect(await screen.findByText('ORD-1002')).toBeInTheDocument();
});
