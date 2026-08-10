// Shop page's mock catalog - this app has no products table/API (its only
// real "product" concept lives on `orders` rows, see migrations/
// 1784973065584_initial-schema.sql), so ShopPage has nothing to fetch from.
// Names and prices below are copied from that same migration's seed data
// (and 1785095226496_add-order-pricing-and-product-icon.sql for pricing/
// icon) rather than invented, so this page's catalog stays numerically
// consistent with what OrdersPage/OrderDetailPage already show for the
// same five products. `id`/`icon` reuse icons.jsx's own PRODUCT_ICONS keys
// as one join key instead of two.
export const SHOP_PRODUCTS = [
  {
    id: 'headphones',
    icon: 'headphones',
    name: 'Wireless Noise-Cancelling Headphones',
    category: 'Audio',
    description: 'Over-ear comfort with active noise cancellation.',
    priceCents: 14999,
    originalPriceCents: null,
    colorways: [
      { id: 'black', label: 'Black', hex: '#1a1a1a' },
      { id: 'white', label: 'White', hex: '#f2f2f2' },
      { id: 'navy', label: 'Navy', hex: '#1e3a5f' },
    ],
  },
  {
    id: 'keyboard',
    icon: 'keyboard',
    name: 'Mechanical Keyboard',
    category: 'Peripherals',
    description: 'Tactile switches with per-key backlighting.',
    // The one discounted item - 8999 matches this same product's real
    // seeded order price exactly (see migration referenced above); 11999
    // is a clean number that also lands almost exactly on -25% off
    // (11999 * 0.75 ≈ 8999), so the discount is real and round at once
    // instead of two unrelated invented numbers.
    priceCents: 8999,
    originalPriceCents: 11999,
    colorways: [
      { id: 'black', label: 'Black', hex: '#1a1a1a' },
      { id: 'white', label: 'White', hex: '#f2f2f2' },
      { id: 'gray', label: 'Gray', hex: '#8a8a8a' },
    ],
  },
  {
    id: 'chair',
    icon: 'chair',
    name: 'Ergonomic Office Chair',
    category: 'Office',
    description: 'Adjustable lumbar support for all-day sitting.',
    priceCents: 24999,
    originalPriceCents: null,
    colorways: [
      { id: 'black', label: 'Black', hex: '#1a1a1a' },
      { id: 'gray', label: 'Gray', hex: '#8a8a8a' },
      { id: 'blue', label: 'Blue', hex: '#3b5f8f' },
    ],
  },
  {
    id: 'monitor',
    icon: 'monitor',
    name: '27" 4K Monitor',
    category: 'Displays',
    description: 'Sharp UHD resolution for work and creative tasks.',
    priceCents: 32999,
    originalPriceCents: null,
    // Deliberately empty, not omitted - monitors in this catalog ship in
    // one finish only, and ProductCard checks colorways.length to decide
    // whether to render the swatch row at all.
    colorways: [],
  },
  {
    id: 'cable',
    icon: 'cable',
    name: 'USB-C Charging Cable (3-pack)',
    category: 'Accessories',
    description: 'Fast-charging cables in three lengths.',
    priceCents: 1999,
    originalPriceCents: null,
    colorways: [
      { id: 'white', label: 'White', hex: '#f2f2f2' },
      { id: 'black', label: 'Black', hex: '#1a1a1a' },
    ],
  },
  // The one product with a real detail page (see ProductDetailPage.jsx) -
  // a one-off promotional item, not backed by real order data like the
  // five above (no migration seeds it), so its price is fabricated
  // content the same way ShopNowDialog's AirBuds White already is, not a
  // number copied from a real source. 9600/12800 is a clean, exact 25%
  // off (the reference screenshot's own $96.23 doesn't actually compute
  // to 25% off $128.00 - kept round instead of copying that mismatch
  // verbatim, same "the discount is real and round" standard the keyboard
  // entry above already holds to). Its rating/reviews/specs live in
  // productDetails.js, not here - see that file's own comment for why
  // being a key there (not a flag on this entry) is what actually makes
  // ProductCard link this card's heading to a real detail page. Every
  // product below now has one too (headphones/keyboard/chair/monitor/
  // cable), so all six cards link out now, not just this one.
  {
    id: 'cloud-shift-runner',
    icon: 'sneaker',
    name: 'Cloud Shift Runner',
    category: 'Sneakers',
    description: 'Daily road runner with breathable mesh, a single-density foam midsole, and a rubber outsole built for steady miles.',
    priceCents: 9600,
    originalPriceCents: 12800,
    colorways: [
      { id: 'cherry', label: 'Cherry', hex: '#c81e3a' },
      { id: 'navy', label: 'Navy', hex: '#1e3a5f' },
      { id: 'white', label: 'White', hex: '#f2f2f2' },
      { id: 'yellow', label: 'Yellow', hex: '#f2c14e' },
      { id: 'green', label: 'Green', hex: '#b9e63a' },
    ],
  },
];

// Seeds ShopPage's wishlist Set - the keyboard starts pre-wishlisted,
// mirroring the reference screenshot's own layout (its one discounted card
// is also the one with an already-filled heart).
export const DEFAULT_WISHLISTED_IDS = ['keyboard'];
