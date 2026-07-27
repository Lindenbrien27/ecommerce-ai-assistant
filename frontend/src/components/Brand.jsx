// Single source of truth for the brand mark (icon + wordmark) - used in
// Layout's nav (top-left, alongside the page tabs) and VerifyPage (centered,
// standalone auth-screen convention) so both places stay in sync if the
// mark ever changes.
import { BrandMarkIcon } from './icons.jsx';

export function Brand({ size = 'md', showLabel = true }) {
  return (
    <div className={`brand brand-${size}`}>
      <span className="brand-mark" aria-hidden="true">
        <BrandMarkIcon />
      </span>
      {showLabel && <span className="brand-name">LnDn</span>}
    </div>
  );
}
