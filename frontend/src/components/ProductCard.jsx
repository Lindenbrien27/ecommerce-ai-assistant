import { Link } from 'react-router-dom';
import { PRODUCT_PHOTOS } from './ProductImage.jsx';
import { PRODUCT_DETAILS } from '../data/productDetails.js';
import { formatCents } from '../utils/pricing.js';

export function ProductCard({ product, wishlisted, onToggleWishlist }) {
  const { name, category, description, price_cents: priceCents, original_price_cents: originalPriceCents, colorways, icon } = product;
  const hasDiscount = originalPriceCents != null;
  const discountPct = hasDiscount ? Math.round((1 - priceCents / originalPriceCents) * 100) : 0;
  const photoUrl = PRODUCT_PHOTOS[icon];
  const hasDetailPage = Boolean(PRODUCT_DETAILS[product.slug]);

  const media = (
    <div className={`shop-card-media${photoUrl ? '' : ' swatch-fan'}`}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} loading="lazy" />
      ) : (

        colorways.map((c) => <span key={c.id} className="shop-swatch-fan-chip" style={{ background: c.hex }} aria-hidden="true" />)
      )}

      {hasDiscount && <span className="shop-card-discount">−{discountPct}%</span>}

      <button
        type="button"
        className={`shop-card-wish${wishlisted ? ' active' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          onToggleWishlist();
        }}
        aria-pressed={wishlisted}
        aria-label={wishlisted ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 5 5.5 5c2 0 3.5 1.2 4.5 2.7C11 6.2 12.5 5 14.5 5 18 5 19.5 8.4 18 11.9 15.5 16.4 12 21 12 21z" />
        </svg>
      </button>
    </div>
  );

  const body = (
    <>
      <p className="shop-card-category">{category}</p>
      <h3 className="shop-card-name">{name}</h3>
      <p className="shop-card-desc">{description}</p>
      {colorways.length > 0 && (
        <div className="shop-card-dots" role="group" aria-label={`${name} colors`}>
          {colorways.map((c) => (
            <span key={c.id} className="shop-card-dot" style={{ background: c.hex }} title={c.label} />
          ))}
        </div>
      )}
      <p className="shop-card-price-row">
        <span className="shop-card-price">{formatCents(priceCents)}</span>
        {hasDiscount && <span className="shop-card-price-was">{formatCents(originalPriceCents)}</span>}
      </p>
    </>
  );

  if (hasDetailPage) {
    return (
      <Link to={`/shop/${product.slug}`} className="shop-card">
        {media}
        {body}
      </Link>
    );
  }

  return (
    <article className="shop-card">
      {media}
      {body}
    </article>
  );
}
