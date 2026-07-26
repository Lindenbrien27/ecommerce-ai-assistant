// Small hand-rolled icon set - matches Brand.jsx's own plain currentColor
// SVG approach instead of pulling in an icon library dependency for what's
// only a handful of icons.

// The package-box glyph from Brand.jsx's own mark, extracted here so the
// chat assistant's avatar (MessageBubble.jsx) can reuse the exact same icon
// instead of duplicating the path data - same identity ("the app" talking
// to you), same icon, in both places.
export function BrandMarkIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

export function OrdersIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

export function ChatIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ChevronIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Product illustrations - not photos (this app has no real product photos
// to show, and fetching stock images from an external host would both
// misrepresent the specific item and require a new CSP img-src exception,
// see index.css's "self-contained SPA" comment on the CSP). Plain
// currentColor line icons instead, same convention as every other icon in
// this file, just larger and used as ProductImage's illustration rather
// than a small inline glyph.
export function HeadphonesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

export function CableIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8z" />
      <path d="M12 18v4" />
    </svg>
  );
}

export function KeyboardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="6" y1="9" x2="6.01" y2="9" />
      <line x1="10" y1="9" x2="10.01" y2="9" />
      <line x1="14" y1="9" x2="14.01" y2="9" />
      <line x1="18" y1="9" x2="18.01" y2="9" />
      <line x1="6" y1="13" x2="6.01" y2="13" />
      <line x1="10" y1="13" x2="10.01" y2="13" />
      <line x1="14" y1="13" x2="14.01" y2="13" />
      <line x1="18" y1="13" x2="18.01" y2="13" />
      <line x1="7" y1="17" x2="17" y2="17" />
    </svg>
  );
}

export function ChairIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="2" width="10" height="9" rx="2" />
      <rect x="6" y="11" width="12" height="5" rx="1" />
      <line x1="12" y1="16" x2="12" y2="19" />
      <path d="M6 22l6-2 6 2" />
    </svg>
  );
}

export function MonitorIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

// Keyed by the order's own product_icon column (see
// migrations/1785095226496_add-order-pricing-and-product-icon.sql) - not
// derived from product_name, which is free text.
export const PRODUCT_ICONS = {
  headphones: HeadphonesIcon,
  cable: CableIcon,
  keyboard: KeyboardIcon,
  chair: ChairIcon,
  monitor: MonitorIcon,
};
