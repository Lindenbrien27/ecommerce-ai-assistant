import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAuthProvider } from '../context/AdminAuthContext.jsx';
import { AdminLoginForm, handleGoogleCredential, __resetGsiScriptStateForTests } from './AdminLoginForm.jsx';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('handleGoogleCredential', () => {
  it('posts the Google credential, logs in, and navigates to /admin on success', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ email: 'admin@example.com' }) });
    const login = vi.fn();
    const navigate = vi.fn();

    const result = await handleGoogleCredential({ credential: 'fake-id-token' }, { login, navigate });

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/auth/google',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'fake-id-token' }) })
    );
    expect(login).toHaveBeenCalledWith('admin@example.com');
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('does not log in or navigate when the backend rejects the credential', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Not authorized.' }) });
    const login = vi.fn();
    const navigate = vi.fn();

    const result = await handleGoogleCredential({ credential: 'fake-id-token' }, { login, navigate });

    expect(result).toBe(false);
    expect(login).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

function renderForm() {
  return render(
    <AdminAuthProvider>
      <MemoryRouter>
        <AdminLoginForm />
      </MemoryRouter>
    </AdminAuthProvider>
  );
}

function getGsiScript() {
  return document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`);
}

describe('AdminLoginForm', () => {
  beforeEach(() => {
    document.head.querySelectorAll('script').forEach((el) => el.remove());
    delete window.google;
    __resetGsiScriptStateForTests();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');

    global.fetch.mockResolvedValue({ ok: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('surfaces an error when the backend rejects the Google credential (handleGoogleCredential returning false is actually read)', async () => {
    let capturedCallback;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(({ callback }) => {
            capturedCallback = callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };
    global.fetch.mockImplementation((url) => {
      if (url === '/api/admin/auth/google') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Not authorized.' }) });
      }
      return Promise.resolve({ ok: false });
    });

    renderForm();

    await waitFor(() => expect(capturedCallback).toBeTypeOf('function'));

    await act(async () => {
      await capturedCallback({ credential: 'fake-id-token' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in was rejected/i);
  });

  it('surfaces an error when the Google Sign-In script fails to load', async () => {
    renderForm();
    await waitFor(() => expect(getGsiScript()).toBeTruthy());
    await act(async () => {
      getGsiScript().onerror();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load google sign-in/i);
  });

  it('surfaces an error and never loads the Google script when VITE_GOOGLE_CLIENT_ID is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't configured/i);
    expect(consoleError).toHaveBeenCalled();
    expect(getGsiScript()).toBeNull();

    consoleError.mockRestore();
  });
});
