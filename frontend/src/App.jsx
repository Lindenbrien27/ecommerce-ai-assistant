import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { PublicOnlyRoute } from './components/PublicOnlyRoute.jsx';
import { Layout } from './components/Layout.jsx';
import { CardIcon, HeartIcon, PersonIcon, PinIcon, ShopIcon, TicketIcon } from './components/icons.jsx';

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
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then((m) => ({ default: m.ProfilePage })));
const ComingSoonPage = lazy(() =>
  import('./pages/ComingSoonPage.jsx').then((m) => ({ default: m.ComingSoonPage }))
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
                <Route path="/profile" element={<ProfilePage />} />
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
                <Route
                  path="/wishlist"
                  element={
                    <ComingSoonPage
                      icon={HeartIcon}
                      title="Wishlist"
                      text="Products you save for later will show up here once this is built."
                    />
                  }
                />
                <Route
                  path="/shop"
                  element={
                    <ComingSoonPage
                      icon={ShopIcon}
                      title="Shop"
                      text="Browsing and buying new products will be available here once this is built."
                    />
                  }
                />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
