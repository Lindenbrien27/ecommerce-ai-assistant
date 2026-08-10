import { PRODUCT_ICONS } from './icons.jsx';

// Local photos, served from public/images/products (same-origin, no COEP/CORS
// concerns) instead of the previous Wikimedia hotlinks. Exported (not just
// used internally) so ProductDetailPage.jsx can render the same real
// photos in its own differently-shaped hero, rather than duplicating this
// map or wrapping <ProductImage> itself (whose sizing classes are tuned
// for the grid card/order-row contexts, not a big detail-page hero).
export const PRODUCT_PHOTOS = {
  headphones: '/images/products/luke-peterson-lUMj2Zv5HUE-unsplash.jpg',
  cable: '/images/products/homemade-media-6l5z2EPrnFc-unsplash.jpg',
  keyboard: '/images/products/pparnxoxo-vdAR-KDxHNY-unsplash.jpg',
  chair: '/images/products/effydesk-7mfNpV5eJH0-unsplash.jpg',
  monitor: '/images/products/sebastian-bednarek-x2Z0uNj-Quo-unsplash.jpg',
};

// icon is the order's own product_icon value (a stable identifier, not
// derived from the free-text product name). Falls back to the plain icon
// tile (icons.jsx) rather than rendering nothing if a photo isn't mapped
// for it - older/future data isn't guaranteed to have either, and a
// missing decorative image shouldn't break the layout.
export function ProductImage({ icon, size = 'md' }) {
  const photoUrl = PRODUCT_PHOTOS[icon];
  const Icon = PRODUCT_ICONS[icon];

  return (
    <span className={`product-image product-image-${size}`} aria-hidden="true">
      {photoUrl ? (
        <img src={photoUrl} alt="" loading="lazy" />
      ) : (
        Icon && <Icon />
      )}
    </span>
  );
}
