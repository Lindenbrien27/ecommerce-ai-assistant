import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { PublicOnlyRoute } from './PublicOnlyRoute.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/orders" element={<div>orders page</div>} />
          <Route element={<PublicOnlyRoute />}>
            <Route path="/verify" element={<div>verify page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('PublicOnlyRoute', () => {
  it('renders the public route when there is no token', () => {
    renderAt('/verify');
    expect(screen.getByText('verify page')).toBeInTheDocument();
  });

  it('redirects an already-verified customer away from /verify to /orders', () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'a-token');
    renderAt('/verify');
    expect(screen.getByText('orders page')).toBeInTheDocument();
  });
});
