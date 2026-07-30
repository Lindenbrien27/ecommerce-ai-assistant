import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const OrdersContext = createContext(null);

// Single shared fetch/pagination state for the signed-in customer's order
// list - both OrdersPage (the full list) and Layout's sidebar (My
// Orders/Coupons counts) need this same data now, and firing one fetch
// from each independently doubled every authenticated page load's request
// count for no benefit (the second request just re-fetched what the first
// one already had, server-side cache or not - still a real extra
// round-trip). One provider, mounted once in Layout, both consume it.
export function OrdersProvider({ children }) {
  const authorizedFetch = useAuthorizedFetch();
  const [orders, setOrders] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  // Keyed by product_icon (the same stable identifier ProductImage.jsx and
  // CategoryBadgesEditor.jsx already key off of) - a Set of icon values is
  // exactly what OrdersPage needs to filter by, with no label<->icon
  // lookup required on this side. Exposed as the raw setter, not a
  // per-icon toggle - CategoryBadgesEditor stages edits in its own local
  // draft Set and only ever replaces this whole Set at once, on Save.
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());

  async function loadPage(cursor) {
    const url = cursor ? `/api/orders?cursor=${encodeURIComponent(cursor)}` : '/api/orders';
    const res = await authorizedFetch(url);

    if (res.status === 401) {
      return null;
    }

    if (!res.ok) {
      setError('Something went wrong loading your orders.');
      return null;
    }

    return res.json();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await loadPage();
        if (!data || cancelled) return;
        setOrders(data.orders);
        setNextCursor(data.nextCursor);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await loadPage(nextCursor);
      if (!data) return;
      setOrders((prev) => [...prev, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <OrdersContext.Provider
      value={{ orders, nextCursor, loadingMore, error, loadMore, selectedCategories, setSelectedCategories }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within an OrdersProvider');
  return ctx;
}
