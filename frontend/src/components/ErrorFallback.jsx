import { Brand } from './Brand.jsx';

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
