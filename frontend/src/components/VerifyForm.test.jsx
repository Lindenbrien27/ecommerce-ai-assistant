import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerifyForm } from './VerifyForm.jsx';

beforeEach(() => {
  global.fetch = vi.fn();
});

async function requestCode(user, email = 'jane.doe@example.com') {
  await user.type(screen.getByLabelText(/email address/i), email);
  await user.click(screen.getByRole('button', { name: /send code/i }));
}

async function fillCode(user, code = '123456') {
  for (let i = 0; i < code.length; i += 1) {
    await user.type(screen.getByLabelText(new RegExp(`digit ${i + 1} of 6`, 'i')), code[i]);
  }
}

describe('VerifyForm', () => {
  it('requests a code, then verifies it and calls onVerified with the token', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'sent' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'abc123' }) });
    const onVerified = vi.fn();
    const user = userEvent.setup();

    render(<VerifyForm onVerified={onVerified} />);
    await requestCode(user);

    expect(await screen.findByRole('heading', { name: /enter the code/i })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/auth/otp/request',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'jane.doe@example.com' }) })
    );

    await fillCode(user);
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('abc123'));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/auth/otp/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'jane.doe@example.com', code: '123456' }),
      })
    );
  });

  it('shows the server error and stays on the email step when the request fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'A valid email address is required.' }) });
    const user = userEvent.setup();

    render(<VerifyForm onVerified={vi.fn()} />);
    await requestCode(user);

    expect(await screen.findByText('A valid email address is required.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /enter the code/i })).not.toBeInTheDocument();
  });

  it('shows a generic error when the server is unreachable while requesting a code', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<VerifyForm onVerified={vi.fn()} />);
    await requestCode(user);

    expect(
      await screen.findByText("Couldn't reach the server. Please check your connection and try again.")
    ).toBeInTheDocument();
  });

  it('shows the server error and does not call onVerified when the code is wrong', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'sent' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "That code isn't right or has expired." }) });
    const onVerified = vi.fn();
    const user = userEvent.setup();

    render(<VerifyForm onVerified={onVerified} />);
    await requestCode(user);
    await fillCode(user);
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    expect(await screen.findByText("That code isn't right or has expired.")).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows the dev-mode code when the server includes one (no email provider configured)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'sent', devCode: '654321' }) });
    const user = userEvent.setup();

    render(<VerifyForm onVerified={vi.fn()} />);
    await requestCode(user);

    expect(await screen.findByText('654321')).toBeInTheDocument();
  });

  it('lets the user go back to the email step from the code step', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'sent' }) });
    const user = userEvent.setup();

    render(<VerifyForm onVerified={vi.fn()} />);
    await requestCode(user);
    expect(await screen.findByRole('heading', { name: /enter the code/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /use a different email/i }));

    expect(screen.getByRole('heading', { name: /track your orders/i })).toBeInTheDocument();
  });
});
