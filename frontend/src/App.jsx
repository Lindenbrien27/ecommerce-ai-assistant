import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { PublicOnlyRoute } from './components/PublicOnlyRoute.jsx';
import { Layout } from './components/Layout.jsx';
import { CardIcon, PinIcon, TicketIcon } from './components/icons.jsx';

// Route-level code splitting - each page (and whatever it alone depends on)
// ships as its own chunk, fetched only when that route is actually visited,
// instead of one bundle containing every page whether it's needed yet or
// not. The .then() adapters exist because these pages use named exports;
// React.lazy() requires a module with a default export.
const VerifyPage = lazy(() => import('./pages/VerifyPage.jsx').then((m) => ({ default: m.VerifyPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetailPage.jsx').then((m) => ({ default: m.OrderDetailPage }))
);
const ChatPage = lazy(() => import('./pages/ChatPage.jsx').then((m) => ({ default: m.ChatPage })));
const ShopPage = lazy(() => import('./pages/ShopPage.jsx').then((m) => ({ default: m.ShopPage })));
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage.jsx').then((m) => ({ default: m.ProductDetailPage }))
);
const ComingSoonPage = lazy(() =>
  import('./pages/ComingSoonPage.jsx').then((m) => ({ default: m.ComingSoonPage }))
);
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage.jsx').then((m) => ({ default: m.CheckoutPage }))
);
const BagPage = lazy(() => import('./pages/BagPage.jsx').then((m) => ({ default: m.BagPage })));
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage.jsx').then((m) => ({ default: m.WishlistPage }))
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<p className="subtitle">Loading...</p>}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/verify" element={<VerifyPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:orderNumber" element={<OrderDetailPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route
                  path="/coupons"
                  element={
                    <ComingSoonPage
                      icon={TicketIcon}
                      title="Coupons"
                      text="Saved coupons and promo codes will show up here once this is built."
                    />
                  }
                />
                <Route path="/wishlist" element={<WishlistPage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/shop/:productId" element={<ProductDetailPage />} />
                <Route path="/bag" element={<BagPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route
                  path="/address"
                  element={
                    <ComingSoonPage
                      icon={PinIcon}
                      title="Address"
                      text="Saved shipping addresses will show up here once this is built."
                    />
                  }
                />
                <Route
                  path="/payment"
                  element={
                    <ComingSoonPage
                      icon={CardIcon}
                      title="Payment Methods"
                      text="Saved payment methods will show up here once this is built."
                    />
                  }
                />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </Suspense>
        {/* Mounted once at the root, not per-page - toasts (e.g. BagPage's
            remove/undo) need to survive whichever route triggered them and
            outlive a navigation away from that page. gap/offset match this
            app's own --space-3 rhythm; toastOptions.unstyled lets each call
            site fully own its markup (see UndoToast in BagPage.jsx) instead
            of fighting Sonner's own default toast chrome. */}
        <Toaster position="bottom-center" gap={12} toastOptions={{ unstyled: true }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
