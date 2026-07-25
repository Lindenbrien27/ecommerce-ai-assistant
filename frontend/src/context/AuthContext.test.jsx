import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext.jsx';

const TOKEN_STORAGE_KEY = 'orderAssistantToken';

function Probe() {
  const { token, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="token">{token ?? 'none'}</span>
      <button onClick={() => login('new-token')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('AuthContext', () => {
  it('starts with no token when sessionStorage is empty', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId('token')).toHaveTextContent('none');
  });

  it('reads an existing token from sessionStorage on mount', () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'existing-token');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId('token')).toHaveTextContent('existing-token');
  });

  it('login() updates state and persists to sessionStorage', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await user.click(screen.getByText('login'));

    expect(screen.getByTestId('token')).toHaveTextContent('new-token');
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token');
  });

  it('logout() clears state and sessionStorage', async () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'existing-token');
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await user.click(screen.getByText('logout'));

    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('useAuth throws when used outside an AuthProvider', () => {
    // Suppress the expected React error-boundary console.error noise for this one assertion.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });
});
