// frontend/src/pages/AdminProductsPage.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProductsPage } from './AdminProductsPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', sku: 'AUD-HP-001', category: 'Audio', price_cents: 14999, stock_quantity: 42 },
  { slug: 'keyboard', name: 'Mechanical Keyboard', sku: 'PER-KB-002', category: 'Peripherals', price_cents: 8999, stock_quantity: 18 },
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
    if (url === '/api/products') return Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) });
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

it('links to the new-product page', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByRole('link', { name: /new product/i })).toHaveAttribute('href', '/admin/products/new');
});

it('filters by name, SKU, or category client-side', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.change(screen.getByLabelText(/search products/i), { target: { value: 'PER-KB' } });
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
  expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up products.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
