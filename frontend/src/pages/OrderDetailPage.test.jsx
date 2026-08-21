import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { OrderDetailPage } from './OrderDetailPage.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

const ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  product_icon: 'headphones',
  status: 'delivered',
  carrier: 'UPS',
  tracking_number: '1Z999AA10123456784',
  created_at: '2026-01-01T00:00:00Z',
  estimated_delivery: '2026-01-05T00:00:00Z',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
};

function mockOrder(overrides = {}) {
  const order = { ...ORDER, ...overrides };
  global.fetch = vi.fn((url) => {
    if (String(url).startsWith('/api/orders/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => order });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
  return order;
}

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/orders/ORD-1001']}>
        <Routes>
          <Route path="/orders/:orderNumber" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {

  sessionStorage.setItem(TOKEN_STORAGE_KEY, 'the-token');
  mockOrder();
});

it('renders the order once loaded', async () => {
  renderPage();
  expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
  expect(screen.getAllByText('Sneakers').length).toBeGreaterThan(0);
});

it('shows a not-found message for an unknown order', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(/order not found/i);
});

it('renders the live tracking widget for an in-flight order', async () => {
  mockOrder({ status: 'shipped' });
  renderPage();
  await screen.findByText('ORD-1001');
  expect(screen.getByText(/1Z999AA10123456784/)).toBeInTheDocument();
});

it('renders a proper Returned badge for a refunded order', async () => {
  mockOrder({ status: 'returned' });
  const { container } = renderPage();
  await screen.findByText('ORD-1001');

  const badge = container.querySelector('.order-status-badge');
  expect(badge).toHaveTextContent('Returned');

  expect(badge).toHaveClass('returned');
  expect(badge?.querySelector('svg')).toBeTruthy();
});

it('shows the whole journey as complete for a returned order, not as though it never started', async () => {
  mockOrder({ status: 'returned' });
  const { container } = renderPage();
  await screen.findByText('ORD-1001');

  const steps = container.querySelectorAll('.order-journey-step');

  expect(steps).toHaveLength(5);

  steps.forEach((step) => expect(step).toHaveClass('completed'));
  expect(container.querySelector('.order-journey-step.current')).toHaveTextContent('Delivered');
});

it('does not label the delivery date as an estimate for a returned order', async () => {
  mockOrder({ status: 'returned' });
  const { container } = renderPage();
  await screen.findByText('ORD-1001');

  const dates = [...container.querySelectorAll('.order-journey-date')].map((n) => n.textContent);
  expect(dates.some((d) => /^Est\./.test(d))).toBe(false);
});

it('hides the live tracking widget for a returned order', async () => {
  mockOrder({ status: 'returned' });
  renderPage();
  await screen.findByText('ORD-1001');

  expect(screen.queryByText(/1Z999AA10123456784/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /track shipment/i })).not.toBeInTheDocument();
});

it('still short-circuits the journey for a cancelled order', async () => {
  mockOrder({ status: 'cancelled' });
  renderPage();
  await screen.findByText('ORD-1001');

  expect(screen.getByText(/this order was cancelled/i)).toBeInTheDocument();
  expect(screen.queryByText(/1Z999AA10123456784/)).not.toBeInTheDocument();
});
