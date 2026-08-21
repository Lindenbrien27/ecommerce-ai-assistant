import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext.jsx';

function Consumer() {
  const { email, checked, logout } = useAdminAuth();
  if (!checked) return <div>checking</div>;
  return (
    <div>
      <div data-testid="email">{email ?? 'none'}</div>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <AdminAuthProvider>
      <Consumer />
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('AdminAuthContext logout', () => {

  it('still clears local email state when the logout request fails on the network', async () => {
    global.fetch.mockImplementation((url, options) => {
      if (!options) {

        return Promise.resolve({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
      }
      return Promise.reject(new Error('network down'));
    });

    renderConsumer();
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('admin@example.com'));

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('none'));
  });
});
