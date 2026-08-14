import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminProtectedRoute } from './AdminProtectedRoute.jsx';

function renderAt(path) {
  return render(
    <AdminAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/login" element={<div>admin login page</div>} />
          <Route element={<AdminProtectedRoute />}>
            <Route path="/admin" element={<div>admin dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('AdminProtectedRoute', () => {
  it('redirects to /admin/login when the session check comes back unauthenticated', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    renderAt('/admin');
    expect(await screen.findByText('admin login page')).toBeInTheDocument();
  });

  it('renders the protected route when the session check succeeds', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    renderAt('/admin');
    expect(await screen.findByText('admin dashboard')).toBeInTheDocument();
  });
});
