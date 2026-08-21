import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function PublicOnlyRoute() {
  const { token } = useAuth();
  if (token) return <Navigate to="/orders" replace />;
  return <Outlet />;
}
