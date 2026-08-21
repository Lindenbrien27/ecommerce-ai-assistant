import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductsPage } from './AdminProductsPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', sku: 'AUD-HP-001', category: 'Audio', price_cents: 14999, original_price_cents: null, stock_quantity: 42, icon: 'headphones' },
  { slug: 'keyboard', name: 'Mechanical Keyboard', sku: 'PER-KB-002', category: 'Peripherals', price_cents: 8999, original_price_cents: 11999, stock_quantity: 18, icon: 'keyboard' },
];

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ products: PRODUCTS, total: 2, page: 1, pageSize: 10, categories: ['Audio', 'Peripherals'] }),
      });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders products fetched from the API', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('AUD-HP-001')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
});

it('links each row to that product\'s edit page', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByRole('link', { name: /wireless noise-cancelling headphones/i })).toHaveAttribute(
    'href',
    '/admin/products/headphones/edit'
  );
});

it('opens the new-product sheet from the trigger button', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /new product/i }));
  expect(await screen.findByRole('dialog', { name: /new product/i })).toBeInTheDocument();
});

it('shows an original price struck through when a product has one', async () => {
  renderPage();
  await screen.findByText('Mechanical Keyboard');
  expect(screen.getByText('$89.99')).toBeInTheDocument();
  expect(screen.getByText('$119.99')).toBeInTheDocument();
});

it('shows an In Stock badge for products at or above the 10-unit threshold', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  expect(screen.getAllByText('In Stock')).toHaveLength(2);
});

it('shows a Low Stock badge for a product with fewer than 10 units', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          products: [{ slug: 'chair', name: 'Ergonomic Office Chair', sku: 'WRK-CH-003', category: 'Office', price_cents: 24999, original_price_cents: null, stock_quantity: 7, icon: 'chair' }],
          total: 1,
          page: 1,
          pageSize: 10,
          categories: ['Office'],
        }),
      });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('Low Stock')).toBeInTheDocument();
});

it('populates the category filter from the API response and re-fetches page 1 when changed', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  const select = screen.getByLabelText(/filter by category/i);
  expect(within(select).getByRole('option', { name: 'Audio' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Peripherals' })).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'Audio' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('category=Audio') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('re-fetches page 1 with the search query when typed', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');

  fireEvent.change(screen.getByLabelText(/search products/i), { target: { value: 'PER-KB' } });

  await waitFor(() => {
    const called = global.fetch.mock.calls.some(
      ([url]) => String(url).includes('q=PER-KB') && String(url).includes('page=1')
    );
    expect(called).toBe(true);
  });
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up products.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('shows numbered page buttons and refetches page 2 on click', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: [], total: 25, page: 1, pageSize: 10, categories: [] }) });
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

it('shows the empty-filters message when no products match', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/products')) {
      return Promise.resolve({ ok: true, json: async () => ({ products: [], total: 0, page: 1, pageSize: 10, categories: [] }) });
    }
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No products match these filters.')).toBeInTheDocument();
});

it('logs out (redirecting to /admin/login via AdminProtectedRoute) on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') {
      return Promise.resolve({ ok: true });
    }
    if (String(url).startsWith('/api/admin/products')) {
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
