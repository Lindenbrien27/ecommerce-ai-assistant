// Single source of truth for the brand mark (icon + wordmark) - used in
// Layout's nav (top-left, alongside the page tabs) and VerifyPage (centered,
// standalone auth-screen convention) so both places stay in sync if the
// mark ever changes.
export function Brand({ size = 'md' }) {
  return (
    <div className={`brand brand-${size}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </span>
      <span className="brand-name">My Order</span>
    </div>
  );
}
