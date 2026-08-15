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

it('excludes a deleted item\'s delivery surcharge and count from cart totals, not just its row', async () => {
  // CartContext's INITIAL_CART_ITEMS gives 'headphones' the cart's only
  // non-zero surcharge (surchargeCents: 900, fulfillment: 'delivery').
  // Deleting it from the fetched catalog reproduces the exact regression a
  // prior fix left open: the row itself was correctly omitted, but the
  // header count, select-all state, and delivery total were still derived
  // from the raw, unfiltered items array, so headphones' $9.00 surcharge
  // (and its slot in the count) kept flowing into the displayed totals even
  // though the product itself no longer existed.
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ products: PRODUCTS.filter((p) => p.slug !== 'headphones') }),
    })
  );
  renderPage();
  await screen.findByText('Mechanical Keyboard');
  expect(screen.queryByText('Wireless Noise-Cancelling Headphones')).not.toBeInTheDocument();

  // Only keyboard + cable remain resolvable - count and select-all must
  // reflect 2, not the raw cart's 3.
  expect(screen.getByText('2 item(s)')).toBeInTheDocument();
  expect(screen.getByText('Select all (2/2)')).toBeInTheDocument();

  // Subtotal: keyboard (8999) + cable (1999) = 10998, with no phantom
  // headphones price mixed in.
  expect(screen.getByText('$109.98')).toBeInTheDocument();

  // Delivery must show Free (keyboard's own surcharge is 0) - not the
  // phantom headphones surcharge.
  const deliveryLabel = screen.getByText(/^Delivery/);
  expect(deliveryLabel.nextSibling).toHaveTextContent('Free');
  expect(screen.queryByText('+$9.00')).not.toBeInTheDocument();
});

it('shows the empty-bag state when every cart item\'s product has been deleted from the catalog', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ products: [] }) }));
  renderPage();
  expect(await screen.findByText('Your bag is empty.')).toBeInTheDocument();
  expect(screen.getByText('0 item(s)')).toBeInTheDocument();
  // The select-all row only renders when there's at least one resolvable
  // item - none here, so it must not render at all.
  expect(screen.queryByLabelText(/select all/i)).not.toBeInTheDocument();
});
