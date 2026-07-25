import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

// Attaches the current session's token to every request and centralizes
// what an expired/invalid token means (log out) - callers only need to
// handle the response shape that's specific to their own endpoint.
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
