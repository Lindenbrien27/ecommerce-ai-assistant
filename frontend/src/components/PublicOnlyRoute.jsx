import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Keeps an already-verified customer from landing back on the verify form
// (e.g. by navigating to /verify directly while still logged in).
export function PublicOnlyRoute() {
  const { token } = useAuth();
  if (token) return <Navigate to="/orders" replace />;
  return <Outlet />;
}
