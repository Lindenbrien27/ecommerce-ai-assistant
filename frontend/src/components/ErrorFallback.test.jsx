import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sentry } from '../config/sentry.js';
import { ErrorFallback } from './ErrorFallback.jsx';

function Bomb() {
  throw new Error('boom - simulated render error');
}

describe('ErrorFallback', () => {
  it('renders the friendly fallback instead of crashing to a blank page when a component throws', () => {

    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <Bomb />
      </Sentry.ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();

    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });

  it('reloads the page when the button is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadMock = vi.fn();

    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(<ErrorFallback />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
