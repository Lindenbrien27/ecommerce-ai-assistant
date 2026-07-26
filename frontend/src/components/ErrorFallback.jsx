import { Brand } from './Brand.jsx';

// Sentry.ErrorBoundary's fallback - what a customer sees instead of a blank
// crashed page if a rendering error slips through. Reuses the same
// app-shell/brand markup every other page already uses, rather than a
// bare, unstyled error dump - a broken page shouldn't also look broken.
export function ErrorFallback() {
  return (
    <div className="app-shell">
      <div className="brand-standalone">
        <Brand size="lg" />
      </div>
      <h1 tabIndex={-1} ref={(el) => el?.focus()}>
        Something went wrong
      </h1>
      <p className="subtitle">
        This page hit an unexpected error. Reloading usually fixes it - if it keeps happening, please try again
        later.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
