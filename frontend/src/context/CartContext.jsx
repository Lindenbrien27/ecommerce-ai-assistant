import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

// Real catalog products, not fabricated ones - see BagPage.jsx's own
// comment for why (Shop -> Bag -> Checkout should feel like one connected
// catalog). Lifted here, out of BagPage itself, so Layout's sidebar badge
// and BagPage's own list read the same live state instead of the sidebar
// showing a number that goes stale the moment BagPage's local state
// changes (or resets to 3 every time you navigate away and back, the way
// a page-local useState would have). No backend-fetched cart exists for
// this to sync from (unlike OrdersContext, which fetches real data) -
// this is in-memory only, same "no real backend, keep it honest" posture
// wishlist/coupons already have as ComingSoonPage stubs.
const INITIAL_CART_ITEMS = [
  { productId: 'headphones', colorLabel: 'Black', qty: 1, fulfillment: 'delivery', surchargeCents: 900, selected: true },
  { productId: 'keyboard', colorLabel: 'Black', qty: 1, fulfillment: 'delivery', surchargeCents: 0, selected: true },
  { productId: 'cable', colorLabel: 'White', qty: 1, fulfillment: 'pickup', surchargeCents: 0, selected: true },
];

export function CartProvider({ children }) {
  const [items, setItems] = useState(INITIAL_CART_ITEMS);
  return <CartContext.Provider value={{ items, setItems }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
