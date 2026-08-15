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
            <Route path="/admin/customers" element={<p>Customers page</p>} />
            <Route path="/admin/orders/:orderNumber" element={<p>Order detail page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

it('renders both nav links and the signed-in admin email', async () => {
  renderNav();
  expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
});

it('marks the Orders link active on /admin, not the Customers link', async () => {
  renderNav('/admin');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /orders/i })).toHaveClass('active');
  expect(screen.getByRole('link', { name: /customers/i })).not.toHaveClass('active');
});

it('marks the Customers link active on /admin/customers, not the Orders link', async () => {
  renderNav('/admin/customers');
  await screen.findByText('admin@example.com');
  expect(screen.getByRole('link', { name: /customers/i })).toHaveClass('active');
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
