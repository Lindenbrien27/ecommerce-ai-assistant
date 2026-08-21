import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

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
