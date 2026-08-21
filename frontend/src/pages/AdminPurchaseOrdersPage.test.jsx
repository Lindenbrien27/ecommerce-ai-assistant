import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminPurchaseOrdersPage } from './AdminPurchaseOrdersPage.jsx';

const RESPONSE = {
  purchaseOrders: [
    { id: 1, po_number: 'PO-1001', supplier_name: 'Atlas Wholesale', item_count: 3, total_units: 120, total_cents: 458900, receive_into_location: 'Main Warehouse', status: 'draft', expected_date: '2026-08-25T00:00:00.000Z', received_date: null },
    { id: 2, po_number: 'PO-1002', supplier_name: 'Cedar Logistics', item_count: 1, total_units: 40, total_cents: 129900, receive_into_location: 'East DC', status: 'received', expected_date: '2026-08-10T00:00:00.000Z', received_date: '2026-08-12T00:00:00.000Z' },
  ],
  total: 2,
  page: 1,
  pageSize: 8,
  openCount: 1,
};

function renderPage() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminPurchaseOrdersPage />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory/purchase-orders')) {
      return Promise.resolve({ ok: true, json: async () => RESPONSE });
    }
    return Promise.resolve({ ok: false });
  });
});

it('renders rows with PO number, supplier, items summary, total, receive-into, status badge, and date', async () => {
  renderPage();
  await screen.findByText('PO-1001');
  expect(screen.getByText('Atlas Wholesale')).toBeInTheDocument();
  expect(screen.getByText('Cedar Logistics')).toBeInTheDocument();
  expect(screen.getByText('3 SKUs · 120 units')).toBeInTheDocument();
  expect(screen.getByText('1 SKU · 40 units')).toBeInTheDocument();
  expect(screen.getByText('$4,589.00')).toBeInTheDocument();
  expect(screen.getByText('$1,299.00')).toBeInTheDocument();
  expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
  expect(screen.getByText('East DC')).toBeInTheDocument();
  expect(screen.getByText('Draft', { selector: '.admin-po-status-badge' })).toBeInTheDocument();
  expect(screen.getByText('Received', { selector: '.admin-po-status-badge' })).toBeInTheDocument();
  expect(screen.getByText('Aug 25, 2026')).toBeInTheDocument();
  expect(screen.getByText('Aug 12, 2026')).toBeInTheDocument();
});

it('shows the "N open" count', async () => {
  renderPage();
  await screen.findByText('PO-1001');
  expect(screen.getByText('1 open')).toBeInTheDocument();
});

it('re-fetches page 1 with the status filter when changed', async () => {
  renderPage();
  await screen.findByText('PO-1001');
  fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'received' } });
  await waitFor(() => {
    const called = global.fetch.mock.calls.some(([url]) => String(url).includes('status=received') && String(url).includes('page=1'));
    expect(called).toBe(true);
  });
});

it('shows the empty state when there are no purchase orders', async () => {
  global.fetch = vi.fn((url) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (String(url).startsWith('/api/admin/inventory/purchase-orders')) {
      return Promise.resolve({ ok: true, json: async () => ({ ...RESPONSE, purchaseOrders: [], total: 0, openCount: 0 }) });
    }
    return Promise.resolve({ ok: false });
  });
  renderPage();
  expect(await screen.findByText('No purchase orders match these filters.')).toBeInTheDocument();
});

it('logs out on a 401 from the list fetch', async () => {
  global.fetch = vi.fn((url, opts) => {
    if (url === '/api/admin/auth/me') return Promise.resolve({ ok: false });
    if (url === '/api/admin/auth/logout' && opts?.method === 'POST') return Promise.resolve({ ok: true });
    if (String(url).startsWith('/api/admin/inventory/purchase-orders')) return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    return Promise.resolve({ ok: false });
  });
  renderPage();
  await waitFor(() => {
    const loggedOut = global.fetch.mock.calls.some(([url, opts]) => url === '/api/admin/auth/logout' && opts?.method === 'POST');
    expect(loggedOut).toBe(true);
  });
});
