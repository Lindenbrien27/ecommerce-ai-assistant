import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.jsx';
import { useAuthorizedFetch } from './useAuthorizedFetch.js';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

function Probe() {
  const authorizedFetch = useAuthorizedFetch();
  return (
    <button onClick={() => authorizedFetch('/api/orders', { method: 'GET' })}>
      go
    </button>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(TOKEN_STORAGE_KEY, 'the-token');
  global.fetch = vi.fn();
});

describe('useAuthorizedFetch', () => {
  it('attaches the current token as a Bearer Authorization header', async () => {
    global.fetch.mockResolvedValue({ status: 200, ok: true });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await user.click(screen.getByText('go'));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/orders',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer the-token' }),
      })
    );
  });

  it('clears the session (logs out) when the response is a 401', async () => {
    global.fetch.mockResolvedValue({ status: 401, ok: false });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await user.click(screen.getByText('go'));

    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('does not clear the session on a non-401 response', async () => {
    global.fetch.mockResolvedValue({ status: 404, ok: false });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await user.click(screen.getByText('go'));

    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('the-token');
  });
});
