import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { ProductDetailPage } from './ProductDetailPage.jsx';

const PRODUCT = {
  slug: 'cloud-shift-runner',
  name: 'Cloud Shift Runner',
  category: 'Sneakers',
  description: 'Daily road runner.',
  price_cents: 9600,
  original_price_cents: 12800,
  colorways: [{ id: 'cherry', label: 'Cherry', hex: '#c81e3a' }],
  icon: 'sneaker',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/shop/cloud-shift-runner']}>
      <ProductsProvider>
        <Routes>
          <Route path="/shop/:productId" element={<ProductDetailPage />} />
        </Routes>
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: [PRODUCT] }) }));
});

it('renders the product fetched from the real API by slug', async () => {
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Cloud Shift Runner' })).toBeInTheDocument();
  expect(screen.getByText('$96.00')).toBeInTheDocument();
  expect(screen.getByText('$128.00')).toBeInTheDocument();
});

it('renders an inline error instead of hanging on a blank page when the product fetch fails', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading products.' }) })
  );
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
