import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGoogleCredential } from './AdminLoginForm.jsx';

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
