import { createContext, useContext, useEffect, useState } from 'react';

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Something went wrong loading products.');
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setProducts(data.products);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function findProduct(slug) {
    return products ? products.find((p) => p.slug === slug) : undefined;
  }

  return <ProductsContext.Provider value={{ products, error, findProduct }}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within a ProductsProvider');
  return ctx;
}
