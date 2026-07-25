import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { PublicOnlyRoute } from './components/PublicOnlyRoute.jsx';
import { Layout } from './components/Layout.jsx';
import { VerifyPage } from './pages/VerifyPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { OrderDetailPage } from './pages/OrderDetailPage.jsx';
import { ChatPage } from './pages/ChatPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/verify" element={<VerifyPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderNumber" element={<OrderDetailPage />} />
              <Route path="/chat" element={<ChatPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
