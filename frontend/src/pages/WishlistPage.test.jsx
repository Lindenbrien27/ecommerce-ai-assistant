import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { WishlistPage } from './WishlistPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', category: 'Peripherals', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'chair', name: 'Ergonomic Office Chair', category: 'Office', price_cents: 24999, icon: 'chair', colorways: [] },
];

function renderPage() {
  return render(
    <ProductsProvider>
      <CartProvider>
        <WishlistPage />
      </CartProvider>
    </ProductsProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders wishlist entries using real product data looked up by slug', async () => {
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Ergonomic Office Chair')).toBeInTheDocument();
});

it('omits a saved item whose product was deleted from the catalog, without crashing', async () => {

  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ products: PRODUCTS.filter((p) => p.slug !== 'keyboard') }),
    })
  );
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Ergonomic Office Chair')).toBeInTheDocument();
  expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();
});
