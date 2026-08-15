import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { ShopPage } from './ShopPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', description: 'Over-ear comfort.', price_cents: 14999, original_price_cents: null, colorways: [], icon: 'headphones' },
  { slug: 'keyboard', name: 'Mechanical Keyboard', category: 'Peripherals', description: 'Tactile switches.', price_cents: 8999, original_price_cents: 11999, colorways: [], icon: 'keyboard' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsProvider>
        <ShopPage />
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders products fetched from the real API', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
});

it('derives the category filter list from the fetched products', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: /show filters/i }));
  expect(await screen.findByRole('button', { name: 'Audio' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Peripherals' })).toBeInTheDocument();
});

it('shows the correct discounted price using price_cents/original_price_cents', async () => {
  renderPage();
  expect(await screen.findByText('$89.99')).toBeInTheDocument();
  expect(screen.getByText('$119.99')).toBeInTheDocument();
});
