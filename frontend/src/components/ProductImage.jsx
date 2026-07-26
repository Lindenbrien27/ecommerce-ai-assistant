import { PRODUCT_ICONS } from './icons.jsx';

// icon is the order's own product_icon value (a stable identifier, not
// derived from the free-text product name) - renders nothing inside the
// tile if it doesn't match a known icon, rather than throwing, since older
// or future data isn't guaranteed to have one.
export function ProductImage({ icon, size = 'md' }) {
  const Icon = PRODUCT_ICONS[icon];
  return (
    <span className={`product-image product-image-${size}`} aria-hidden="true">
      {Icon && <Icon />}
    </span>
  );
}
