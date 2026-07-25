import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify" element={<div>verify page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/orders" element={<div>orders page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('ProtectedRoute', () => {
  it('redirects to /verify when there is no token', () => {
    renderAt('/orders');
    expect(screen.getByText('verify page')).toBeInTheDocument();
  });

  it('renders the protected route when a token is present', () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'a-token');
    renderAt('/orders');
    expect(screen.getByText('orders page')).toBeInTheDocument();
  });
});
