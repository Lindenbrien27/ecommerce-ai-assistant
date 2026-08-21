import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export function useAuthorizedFetch() {
  const { token, logout } = useAuth();

  return useCallback(
    async (path, options = {}) => {
      const res = await fetch(path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        logout();
      }

      return res;
    },
    [token, logout]
  );
}
