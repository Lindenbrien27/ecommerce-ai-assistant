import { PRODUCT_ICONS } from './icons.jsx';

export const PRODUCT_PHOTOS = {
  headphones: '/images/products/luke-peterson-lUMj2Zv5HUE-unsplash.jpg',
  cable: '/images/products/homemade-media-6l5z2EPrnFc-unsplash.jpg',
  keyboard: '/images/products/pparnxoxo-vdAR-KDxHNY-unsplash.jpg',
  chair: '/images/products/effydesk-7mfNpV5eJH0-unsplash.jpg',
  monitor: '/images/products/sebastian-bednarek-x2Z0uNj-Quo-unsplash.jpg',
};

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
