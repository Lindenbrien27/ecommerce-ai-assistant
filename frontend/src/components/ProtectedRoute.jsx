import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/verify" replace />;
  return <Outlet />;
}
