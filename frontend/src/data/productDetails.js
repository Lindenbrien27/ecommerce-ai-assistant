// Extra content ProductDetailPage.jsx needs that SHOP_PRODUCTS itself
// doesn't carry (rating/reviews/specs, and Cloud Shift Runner's own
// sizes) - kept as a separate keyed lookup, not new fields bolted onto
// every SHOP_PRODUCTS entry, since ProductCard/the shop grid never reads
// any of this. A product's presence as a key here (not a boolean flag
// back on its SHOP_PRODUCTS entry) is what ProductCard/ProductDetailPage
// both treat as "this one has a real detail page" - one source of truth
// instead of two that could drift apart.
//
// Ratings/review counts/specs below are fabricated promotional content,
// the same tier ShopNowDialog's AirBuds White and Cloud Shift Runner
// itself already are - this app has no real reviews table or spec sheet
// data anywhere to read these from.
export const PRODUCT_DETAILS = {
  'cloud-shift-runner': {
    rating: 4.5,
    reviewCount: 834,
    subcategory: 'Running',
    sizes: ['39', '40', '41', '42', '43', '44', '45'],
    unavailableSizes: ['44'],
    specs: [
      { label: 'Upper', value: 'Breathable engineered mesh' },
      { label: 'Midsole', value: 'Single-density molded foam' },
      { label: 'Outsole', value: 'Rubber, multi-surface tread' },
      { label: 'Weight', value: '~255g (size 42)' },
      { label: 'Sizes', value: '39–45 (EU)' },
    ],
  },
  headphones: {
    rating: 4.6,
    reviewCount: 512,
    specs: [
      { label: 'Driver size', value: '40mm dynamic' },
      { label: 'Battery life', value: 'Up to 30 hours' },
      { label: 'Connectivity', value: 'Bluetooth 5.3' },
      { label: 'Noise cancellation', value: 'Active, adjustable' },
      { label: 'Weight', value: '~250g' },
    ],
  },
  keyboard: {
    rating: 4.4,
    reviewCount: 298,
    specs: [
      { label: 'Switch type', value: 'Tactile mechanical' },
      { label: 'Backlighting', value: 'Per-key RGB' },
      { label: 'Connectivity', value: 'USB-C, wired' },
      { label: 'Layout', value: 'Full-size, 104-key' },
      { label: 'Weight', value: '~950g' },
    ],
  },
  chair: {
    rating: 4.3,
    reviewCount: 176,
    specs: [
      { label: 'Materials', value: 'Mesh back, foam seat' },
      { label: 'Adjustments', value: 'Height, tilt, lumbar, armrests' },
      { label: 'Weight capacity', value: '300 lbs' },
      { label: 'Base', value: '5-star aluminum' },
    ],
  },
  monitor: {
    rating: 4.7,
    reviewCount: 421,
    specs: [
      { label: 'Resolution', value: '3840 × 2160 (4K UHD)' },
      { label: 'Panel type', value: 'IPS' },
      { label: 'Refresh rate', value: '60Hz' },
      { label: 'Ports', value: 'HDMI ×2, DisplayPort ×1, USB-C' },
      { label: 'Stand', value: 'Height and tilt adjustable' },
    ],
  },
  cable: {
    rating: 4.2,
    reviewCount: 89,
    specs: [
      { label: 'Lengths included', value: '1m, 2m, 3m' },
      { label: 'Charging speed', value: 'Up to 60W' },
      { label: 'Connector', value: 'USB-C to USB-C' },
      { label: 'Jacket', value: 'Braided nylon' },
    ],
  },
};
