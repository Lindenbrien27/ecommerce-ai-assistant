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

it('derives the category directory from the fetched products', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Peripherals' })).toBeInTheDocument();
});

it('filters to one aisle when a directory category is clicked', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  fireEvent.click(screen.getByRole('button', { name: 'Peripherals' }));
  expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument();
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
});

it('shows the correct discounted price using price_cents/original_price_cents', async () => {
  renderPage();
  expect(await screen.findByText('$89.99')).toBeInTheDocument();
  expect(screen.getByText('$119.99')).toBeInTheDocument();
});

it('renders an inline error instead of an empty grid when the product fetch fails', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading products.' }) })
  );
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument();
});
