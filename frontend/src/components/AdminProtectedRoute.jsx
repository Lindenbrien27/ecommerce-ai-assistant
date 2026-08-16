import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

export function AdminProtectedRoute() {
  const { email, checked } = useAdminAuth();
  if (!checked) return null;
  if (!email) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
