

export function ComingSoonPage({ icon: Icon, title, text }) {
  return (
    <div className="coming-soon shop-page-root">
      <Icon className="coming-soon-icon" aria-hidden="true" />
      <p className="coming-soon-title">{title} is under development</p>
      <p className="coming-soon-text">{text}</p>
    </div>
  );
}
