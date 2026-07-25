// Single source of truth for the brand mark (icon + wordmark) - used in
// Layout's nav (top-left, alongside the page tabs) and VerifyPage (centered,
// standalone auth-screen convention) so both places stay in sync if the
// mark ever changes.
export function Brand({ size = 'md' }) {
  return (
    <div className={`brand brand-${size}`}>
      <svg
        className="brand-mark"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        <rect width="28" height="28" rx="8" fill="var(--color-solid-bg)" />
        <path
          d="M8.5 10.5 14 7.5l5.5 3v7l-5.5 3-5.5-3z"
          stroke="var(--color-primary-text)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M8.5 10.5 14 13.5l5.5-3" stroke="var(--color-primary-text)" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 13.5v7" stroke="var(--color-primary-text)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="brand-name">Order Support</span>
    </div>
  );
}
