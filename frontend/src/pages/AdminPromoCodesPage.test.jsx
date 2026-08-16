import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminPromoCodesPage } from './AdminPromoCodesPage.jsx';

const CODES = [
  { code: 'SPRING15', discount_type: 'percentage', discount_value: 15, usage_limit: 100, usage_count: 12, expires_at: '2026-12-31T00:00:00Z', active: true },
  { code: 'BIGSAVE', discount_type: 'fixed', discount_value: 2000, usage_limit: null, usage_count: 3, expires_at: null, active: false },
];

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminPromoCodesPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: true, json: async () => CODES });
    return Promise.resolve({ ok: false });
  });
});

it('renders codes with formatted discount, usage, and expiry', async () => {
  renderPage();
  expect(await screen.findByText('SPRING15')).toBeInTheDocument();
  expect(screen.getByText('15%')).toBeInTheDocument();
  expect(screen.getByText('12 / 100')).toBeInTheDocument();

  expect(screen.getByText('BIGSAVE')).toBeInTheDocument();
  expect(screen.getByText('$20.00')).toBeInTheDocument();
  expect(screen.getByText('3 / ∞')).toBeInTheDocument();
  expect(screen.getByText('Never')).toBeInTheDocument();
});

it('shows an Active badge for active codes and Inactive for disabled ones', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});

it('links each row to its edit page', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByRole('link', { name: /spring15/i })).toHaveAttribute('href', '/admin/promo-codes/SPRING15/edit');
});

it('links to the new-code page', async () => {
  renderPage();
  await screen.findByText('SPRING15');
  expect(screen.getByRole('link', { name: /new code/i })).toHaveAttribute('href', '/admin/promo-codes/new');
});

it('shows an empty state when there are no codes', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: false });
  });

  renderPage();
  expect(await screen.findByText('No promo codes yet.')).toBeInTheDocument();
});

it('surfaces an error when the fetch fails', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong looking up promo codes.' }) });
  });

  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (url === '/api/admin/promo-codes') return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });

  renderPage();

  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
