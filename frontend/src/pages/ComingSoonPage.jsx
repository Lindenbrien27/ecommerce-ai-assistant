// Shared "not built yet" page for sidebar nav rows with no real feature
// behind them (Coupons/Wishlist - see Layout.jsx) - a real route with an
// honest "under development" state, not a decorative link that silently
// does nothing when clicked.
export function ComingSoonPage({ icon: Icon, title, text }) {
  return (
    <div className="coming-soon">
      <Icon className="coming-soon-icon" aria-hidden="true" />
      <p className="coming-soon-title">{title} is under development</p>
      <p className="coming-soon-text">{text}</p>
    </div>
  );
}
