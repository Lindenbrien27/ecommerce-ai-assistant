import { PRODUCT_ICONS } from './icons.jsx';

// Real photos, hotlinked from Wikimedia Commons - not photos of this app's
// specific fictional orders (no such photos exist), but real, verified,
// appropriately-licensed photos of the actual kind of product each one is.
// Each URL was checked live (HTTP 200, image/jpeg, visually confirmed) and
// each width (500px) is one of Wikimedia's fixed allowed thumbnail sizes
// (arbitrary widths 400 error) - see README > Image credits for the
// license/attribution each of these requires.
const PRODUCT_PHOTOS = {
  headphones:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Sony_WH-CH510_Bluetooth_Over-Ear_Headphone.jpg/500px-Sony_WH-CH510_Bluetooth_Over-Ear_Headphone.jpg',
  cable:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Cavo_USB-C_%3D_USB-C_della_Samsung.jpg/500px-Cavo_USB-C_%3D_USB-C_della_Samsung.jpg',
  keyboard:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Keychron_K4_mechanical_keyboard.jpg/500px-Keychron_K4_mechanical_keyboard.jpg',
  chair:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Desk_chair.jpg/500px-Desk_chair.jpg',
  monitor:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Gigabyte_AORUS_AD27QD_20190601.jpg/500px-Gigabyte_AORUS_AD27QD_20190601.jpg',
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
        // crossOrigin="anonymous", not a plain <img> - this app's COEP:
        // require-corp (securityHeaders.js) blocks any cross-origin
        // resource that doesn't complete a real CORS handshake, which a
        // bare <img src> to another origin never does. Wikimedia sends
        // Access-Control-Allow-Origin: * (verified live), so requesting it
        // in CORS mode is what actually satisfies COEP - without this,
        // the request silently fails (net::ERR_BLOCKED_BY_RESPONSE
        // .NotSameOriginAfterDefaultedToSameOriginByCoep in Chromium),
        // found live, not from reading the COEP spec in the abstract.
        <img src={photoUrl} alt="" loading="lazy" crossOrigin="anonymous" />
      ) : (
        Icon && <Icon />
      )}
    </span>
  );
}
