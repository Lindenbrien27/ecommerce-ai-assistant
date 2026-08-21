import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminNav } from './AdminNav.jsx';

function renderNav(initialPath = '/admin') {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') {
      return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    }
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: false });
  });

  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AdminNav />}>
            <Route path="/admin" element={<p>Orders page</p>} />
            <Route path="/admin/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/admin/customers" element={<p>Customers page</p>} />
            <Route path="/admin/promo-codes" element={<p>Promo codes page</p>} />
            <Route path="/admin/orders/:orderNumber" element={<p>Order detail page</p>} />
            <Route path="/admin/inventory" element={<p>Stock ledger page</p>} />
            <Route path="/admin/inventory/reorder" element={<p>Reorder queue page</p>} />
            <Route path="/admin/inventory/purchase-orders" element={<p>Purchase orders page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

it('renders all nav links and the signed-in admin email', async () => {
  renderNav();
  expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /promo codes/i })).toBeInTheDocument();
});

it('marks the Orders link active on /admin, not any other tab', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /promo codes/i })).not.toHaveClass('active');
});

it('marks the Dashboard link active on /admin/dashboard', async () => {
  renderNav('/admin/dashboard');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /dashboard/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('marks the Customers link active on /admin/customers, not the Orders link', async () => {
  renderNav('/admin/customers');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /customers/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('marks the Promo Codes link active on /admin/promo-codes', async () => {
  renderNav('/admin/promo-codes');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /promo codes/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /orders/i })).not.toHaveClass('active');
});

it('keeps the Orders link active on an order detail page', async () => {
  renderNav('/admin/orders/ORD-1001');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
});

it('renders the routed page content via Outlet', async () => {
  renderNav('/admin');
  expect(await screen.findByText('Orders page')).toBeInTheDocument();
});

it('logs out when the logout button is clicked', async () => {
  renderNav();
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: /log out/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/auth/logout', { method: 'POST' });
  });
});

it('shows the Inventory group collapsed by default off an inventory route', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.queryByRole('link', { name: /stock ledger/i })).not.toBeInTheDocument();
});

it('auto-expands the Inventory group when mounted on an inventory sub-route', async () => {
  renderNav('/admin/inventory/reorder');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /reorder queue/i })).toBeInTheDocument();
});

it('marks the Reorder Queue sub-link active and its siblings inactive', async () => {
  renderNav('/admin/inventory/reorder');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /reorder queue/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /stock ledger/i })).not.toHaveClass('active');
  expect(screen.getByRole('link', { name: /purchase orders/i })).not.toHaveClass('active');
});

it('expands and collapses the Inventory group on click', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  fireEvent.click(screen.getByRole('button', { name: /inventory/i }));
  expect(screen.getByRole('link', { name: /stock ledger/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /inventory/i }));
  expect(screen.queryByRole('link', { name: /stock ledger/i })).not.toBeInTheDocument();
});
