import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext.jsx';
import { ProductsProvider } from '../context/ProductsContext.jsx';
import { BagPage } from './BagPage.jsx';

const PRODUCTS = [
  { slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones', description: 'Over-ear comfort.', price_cents: 14999, icon: 'headphones', colorways: [] },
  { slug: 'keyboard', name: 'Mechanical Keyboard', description: 'Tactile switches.', price_cents: 8999, icon: 'keyboard', colorways: [] },
  { slug: 'cable', name: 'USB-C Charging Cable (3-pack)', description: 'Fast-charging cables.', price_cents: 1999, icon: 'cable', colorways: [] },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsProvider>
        <CartProvider>
          <BagPage />
        </CartProvider>
      </ProductsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: PRODUCTS }) }));
});

it('renders cart items using real product data looked up by slug', async () => {
  renderPage();
  // CartContext's own INITIAL_CART_ITEMS seeds headphones/keyboard/cable -
  // all three now resolve against the fetched product list, not static data.
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
});

it('computes the item price from price_cents', async () => {
  renderPage();
  await screen.findByText('Wireless Noise-Cancelling Headphones');
  expect(screen.getByText('$149.99')).toBeInTheDocument();
});

it('renders an inline error instead of hanging on a blank page when the product fetch fails', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading products.' }) })
  );
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('omits a seeded cart item whose product was deleted from the catalog, without crashing', async () => {
  // CartContext's INITIAL_CART_ITEMS seeds headphones/keyboard/cable, but
  // the fetched catalog here is missing 'keyboard' - as if an admin deleted
  // that product after the cart seed was written. findProduct('keyboard')
  // then returns undefined; the page must drop that row (and its price)
  // instead of throwing on product.name/product.price_cents.
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ products: PRODUCTS.filter((p) => p.slug !== 'keyboard') }),
    })
  );
  renderPage();
  expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('USB-C Charging Cable (3-pack)')).toBeInTheDocument();
  expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();
  // Subtotal should only reflect headphones (14999) + cable (1999) = 16998.
  expect(screen.getByText('$169.98')).toBeInTheDocument();
});
