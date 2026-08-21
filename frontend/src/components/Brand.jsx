

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
