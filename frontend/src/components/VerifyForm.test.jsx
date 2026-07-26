import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerifyForm } from './VerifyForm.jsx';

beforeEach(() => {
  global.fetch = vi.fn();
});

async function fillAndSubmit(user, { orderNumber = 'ORD-1001', email = 'jane.doe@example.com' } = {}) {
  // By label, not placeholder - the form's labels are real and visible
  // (not sr-only), so this is the query a real user/screen-reader would
  // also resolve the field by.
  await user.type(screen.getByLabelText(/order number/i), orderNumber);
  await user.type(screen.getByLabelText(/email address/i), email);
  await user.click(screen.getByRole('button', { name: /verify/i }));
}

describe('VerifyForm', () => {
  it('calls onVerified with the token on a successful verification', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'abc123' }),
    });
    const onVerified = vi.fn();
    const user = userEvent.setup();

    render(<VerifyForm onVerified={onVerified} />);
    await fillAndSubmit(user);

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('abc123'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ orderNumber: 'ORD-1001', email: 'jane.doe@example.com' }),
      })
    );
  });

  it('shows the server error message and does not call onVerified when verification fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "We couldn't verify that order." }),
    });
    const onVerified = vi.fn();
    const user = userEvent.setup();

    render(<VerifyForm onVerified={onVerified} />);
    await fillAndSubmit(user);

    expect(await screen.findByText("We couldn't verify that order.")).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows a generic error when the server is unreachable', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<VerifyForm onVerified={vi.fn()} />);
    await fillAndSubmit(user);

    expect(
      await screen.findByText("Couldn't reach the server. Please check your connection and try again.")
    ).toBeInTheDocument();
  });
});
