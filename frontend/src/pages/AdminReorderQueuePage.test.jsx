import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminReorderQueuePage } from './AdminReorderQueuePage.jsx';

const RESPONSE = {
  items: [
    { id: 1, product_slug: 'headphones', product_name: 'Wireless Noise-Cancelling Headphones', icon: 'headphones', sku_code: 'AUD-HP-001-EDC', available: 5, reorder_point: 15, deficit: 10, suggested_po_qty: 40, supplier_id: 2, supplier_name: 'Cedar Logistics', lead_time_days: 12, days_of_cover: 5.4 },
    { id: 2, product_slug: 'mouse', product_name: 'Wireless Mouse', icon: 'mouse', sku_code: 'ACC-MS-002-MW', available: 0, reorder_point: 12, deficit: 10, suggested_po_qty: 30, supplier_id: 1, supplier_name: 'Atlas Wholesale', lead_time_days: 16, days_of_cover: null },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  suppliers: [{ id: 1, name: 'Atlas Wholesale' }, { id: 2, name: 'Cedar Logistics' }],
  stats: {
    at_risk_value_cents: 719952,
    needing_action_count: 2,
    out_of_stock_count: 1,
    low_stock_count: 1,
  },
};

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminReorderQueuePage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory/reorder')) {
      return Promise.resolve({ ok: true, json: async () => RESPONSE });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders rows with deficit, suggested PO, supplier, and lead time', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-EDC');
  expect(screen.getByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument();
  expect(screen.getByText('Wireless Mouse')).toBeInTheDocument();
  expect(screen.getAllByText('10', { selector: '.admin-inventory-num' }).length).toBe(2);
  expect(screen.getByText('40', { selector: '.admin-inventory-num' })).toBeInTheDocument();
  expect(screen.getByText('30', { selector: '.admin-inventory-num' })).toBeInTheDocument();
  expect(screen.getByText('Cedar Logistics', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('12d lead')).toBeInTheDocument();
  expect(screen.getByText('16d lead')).toBeInTheDocument();
  expect(screen.getByText('5d', { selector: '.admin-inventory-num' })).toBeInTheDocument();
});

it('renders stat cards', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-EDC');
  expect(screen.getByText('At-risk inventory value')).toBeInTheDocument();
  expect(screen.getByText('SKUs needing action')).toBeInTheDocument();
  expect(screen.getByText('2', { selector: '.admin-inventory-stat-value' })).toBeInTheDocument();
});

it('re-fetches page 1 with the urgency filter when changed', async () => {
  renderPage();
  await screen.findByText('AUD-HP-001-EDC');
  fireEvent.change(screen.getByLabelText(/filter by urgency/i), { target: { value: 'out_of_stock' } });
  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('urgency=out_of_stock') && String(url).includes('page=1'));
    expect(called).toBe(true);
  });
});

it('shows the empty state when there are no items', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory/reorder')) {
      return Promise.resolve({ ok: true, json: async () => ({ ...RESPONSE, items: [], total: 0, stats: null }) });
    }
    return Promise.resolve({ ok: false });
  });
  renderPage();
  expect(await screen.findByText('No SKUs are below their reorder point.')).toBeInTheDocument();
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (String(url).startsWith('/api/admin/inventory/reorder')) return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });
  renderPage();
  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
