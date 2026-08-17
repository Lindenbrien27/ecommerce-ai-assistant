import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminStockLedgerPage } from './AdminStockLedgerPage.jsx';

const RESPONSE = {
  items: [
    { id: 1, product_slug: 'headphones', product_name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', icon: 'headphones', price_cents: 14999, location_id: 1, location_name: 'Main Warehouse', sku_code: 'AUD-HP-001-MW', on_hand: 42, allocated: 4, available: 38, reorder_point: 20, avg_daily_units_sold: 1.8, days_of_cover: 23.3, status: 'in_stock', supplier_id: 1, supplier_name: 'Atlas Wholesale', lead_time_days: 16 },
    { id: 2, product_slug: 'headphones', product_name: 'Wireless Noise-Cancelling Headphones', category: 'Audio', icon: 'headphones', price_cents: 14999, location_id: 2, location_name: 'East DC', sku_code: 'AUD-HP-001-EDC', on_hand: 6, allocated: 1, available: 5, reorder_point: 15, avg_daily_units_sold: 1.2, days_of_cover: 5, status: 'low_stock', supplier_id: 2, supplier_name: 'Cedar Logistics', lead_time_days: 12 },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  categories: ['Audio'],
  locations: [{ id: 1, name: 'Main Warehouse' }, { id: 2, name: 'East DC' }],
  suppliers: [{ id: 1, name: 'Atlas Wholesale' }, { id: 2, name: 'Cedar Logistics' }],
  stats: {
    days_of_cover: 15.2, avg_lead_time_days: 14, reorder_risk_count: 1, total_skus: 2,
    units_on_hand: 48, allocated: 5, total_stock_value_cents: 719952,
    out_of_stock_count: 0, low_stock_count: 1, in_stock_count: 1,
  },
};

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminStockLedgerPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory')) {
      return Promise.resolve({ ok: true, json: async () => RESPONSE });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders stat cards and table rows from the API', async () => {
  renderPage();
  expect((await screen.findAllByText('Wireless Noise-Cancelling Headphones')).length).toBe(2);
  expect(screen.getByText('AUD-HP-001-MW')).toBeInTheDocument();
  expect(screen.getByText('Main Warehouse', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('East DC', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('15.2d')).toBeInTheDocument();
});

it('shows In stock and Low stock badges from the row status', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-MW');
  expect(screen.getByText('In stock', { selector: '.admin-products-stock-badge' })).toBeInTheDocument();
  expect(screen.getByText('Low stock', { selector: '.admin-products-stock-badge' })).toBeInTheDocument();
});

it('re-fetches page 1 with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-MW');
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'low_stock' } });
  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('status=low_stock') && String(url).includes('page=1'));
    expect(called).toBe(true);
  });
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (String(url).startsWith('/api/admin/inventory')) return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });
  renderPage();
  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
