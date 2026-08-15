import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductsProvider, useProducts } from './ProductsContext.jsx';

function Probe() {
  const { products, error, findProduct } = useProducts();
  if (error) return <p role="alert">{error}</p>;
  if (!products) return <p>Loading...</p>;
  return (
    <ul>
      {products.map((p) => (
        <li key={p.slug}>{p.name}</li>
      ))}
      <li data-testid="found">{findProduct('headphones')?.name ?? 'not found'}</li>
    </ul>
  );
}

function renderProbe() {
  return render(
    <ProductsProvider>
      <Probe />
    </ProductsProvider>
  );
}

it('fetches products once and exposes them via useProducts', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ products: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }) })
  );

  renderProbe();
  // The single fixture product's name renders twice - once in the product
  // list, once in the findProduct('headphones') probe below it - so this
  // has to assert on all matches rather than a single unique one.
  expect((await screen.findAllByText('Wireless Noise-Cancelling Headphones')).length).toBeGreaterThan(0);
  expect(global.fetch).toHaveBeenCalledWith('/api/products');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('findProduct returns the matching product by slug', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ products: [{ slug: 'headphones', name: 'Wireless Noise-Cancelling Headphones' }] }) })
  );

  renderProbe();
  await waitFor(() => expect(screen.getByTestId('found')).toHaveTextContent('Wireless Noise-Cancelling Headphones'));
});

it('surfaces a fetch failure as an error', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong loading products.' }) }));

  renderProbe();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});
