import { useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CartIcon, CheckIcon, ChevronRightIcon, StarIcon } from '../components/icons.jsx';
import { PRODUCT_PHOTOS } from '../components/ProductImage.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { PRODUCT_DETAILS } from '../data/productDetails.js';
import { formatCents } from '../utils/pricing.js';

const TABS = [
  { key: 'description', label: 'Description' },
  { key: 'specs', label: 'Specs' },
  { key: 'shipping', label: 'Shipping & Returns' },
  { key: 'reviews', label: 'Reviews' },
];

// Like Reaction Floating Particle Effect's color palette - same set
// ProductCard/ShopNowDialog use (see either's own HEART_COLORS comment).
const HEART_COLORS = ['#ff2d78', '#ef4444', '#a855f7', '#ff6b6b', '#ff9f43'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Reachable for any product with a PRODUCT_DETAILS entry (see that file -
// currently all six catalog products). Rating/reviews/specs are
// fabricated promotional content, same tier as ShopNowDialog's AirBuds
// White - this app has no real reviews table or spec sheet anywhere.
export function ProductDetailPage() {
  const { productId } = useParams();
  const { products, error, findProduct } = useProducts();
  const product = findProduct(productId);
  const detail = PRODUCT_DETAILS[productId];

  const [selectedColorId, setSelectedColorId] = useState(product?.colorways[0]?.id ?? null);
  const [selectedSize, setSelectedSize] = useState(detail?.sizes?.[0] ?? null);
  const [activeTab, setActiveTab] = useState('description');
  const [wishlisted, setWishlisted] = useState(false);

  const [hearts, setHearts] = useState([]);
  const heartIdRef = useRef(0);
  const lastTapAtRef = useRef(0);

  function handleWishlistClick() {
    setWishlisted((w) => !w);
    const now = performance.now();
    const isSpam = now - lastTapAtRef.current < 30;
    lastTapAtRef.current = now;
    heartIdRef.current += 1;
    const particle = {
      id: heartIdRef.current,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: Math.round(randomBetween(32, 64)),
      x: Math.round(randomBetween(-45, 45)),
      rotate: Math.round(randomBetween(-15, 15)),
      rise: isSpam ? -Math.round(randomBetween(240, 320)) : -Math.round(randomBetween(140, 210)),
      duration: isSpam ? Number(randomBetween(2.2, 3).toFixed(2)) : Number(randomBetween(1.5, 2.2).toFixed(2)),
    };
    setHearts((prev) => [...prev.slice(-23), particle]);
  }

  function removeHeart(id) {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }

  // A failed fetch leaves products === null forever, same as "still
  // loading" - checked first so a load failure renders the same inline
  // error ShopPage/AdminProductsPage use instead of either hanging on a
  // blank page forever (the loading gate below) or bouncing to /shop
  // (the not-found gate further down).
  if (!product && error) {
    return (
      <p className="verify-error" role="alert">
        {error}
      </p>
    );
  }

  // Catalog fetch (ProductsContext) hasn't resolved yet - products is null
  // only during that initial load, never once it settles (empty array on
  // an empty catalog, populated array otherwise), so this is a one-time
  // "still loading" gate, not an ongoing loading state to render chrome
  // for. Redirecting here before the fetch resolves would send every
  // fresh page load straight back to /shop.
  if (!product && products === null) return null;

  // No matching product, or one with no PRODUCT_DETAILS entry - back to
  // the grid rather than a dead/broken page.
  if (!product || !detail) return <Navigate to="/shop" replace />;

  const { name, category, description, price_cents: priceCents, original_price_cents: originalPriceCents, colorways, icon } = product;
  const hasDiscount = originalPriceCents != null;
  const discountPct = hasDiscount ? Math.round((1 - priceCents / originalPriceCents) * 100) : 0;
  const selectedColor = colorways.find((c) => c.id === selectedColorId);
  const hasColors = colorways.length > 0;
  const photoUrl = PRODUCT_PHOTOS[icon];
  const fullStars = Math.round(detail.rating);

  return (
    <div className="product-detail-root">
      <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
        <Link to="/shop">Shop</Link>
        <ChevronRightIcon aria-hidden="true" />
        <span>{category}</span>
        {detail.subcategory && (
          <>
            <ChevronRightIcon aria-hidden="true" />
            <span>{detail.subcategory}</span>
          </>
        )}
        <ChevronRightIcon aria-hidden="true" />
        <span aria-current="page">{name}</span>
      </nav>

      <div className={`product-detail-main${hasColors ? '' : ' no-thumbs'}`}>
        {hasColors && (
          <div className="product-detail-thumbs" role="group" aria-label={`${name} color`}>
            {colorways.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`product-detail-thumb${c.id === selectedColorId ? ' active' : ''}`}
                onClick={() => setSelectedColorId(c.id)}
                aria-label={c.label}
                aria-pressed={c.id === selectedColorId}
              >
                <span className="product-detail-thumb-fill" style={{ background: c.hex }} />
              </button>
            ))}
          </div>
        )}

        {photoUrl ? (
          <div className="product-detail-hero product-detail-hero-photo">
            <img src={photoUrl} alt={name} />
          </div>
        ) : (
          <div
            className="product-detail-hero"
            style={{ background: `linear-gradient(155deg, ${selectedColor?.hex}cc, ${selectedColor?.hex})` }}
          >
            <svg viewBox="0 0 200 100" fill="none" className="product-detail-hero-shoe" aria-hidden="true">
              <ellipse cx="100" cy="86" rx="86" ry="8" fill="#00000022" />
              <path
                d="M20 70 C 20 55, 40 50, 55 48 C 70 46, 78 30, 100 28 C 120 26, 130 40, 150 44 C 168 47, 180 55, 180 68 C 180 76, 170 80, 150 80 L 30 80 C 24 80, 20 76, 20 70 Z"
                fill="#1a1a1a"
              />
              <path
                d="M20 70 C 20 78, 26 82, 34 82 L 176 82 C 184 82, 188 76, 184 70 C 178 74, 150 76, 100 76 C 60 76, 30 74, 20 70 Z"
                fill="#f4f1ea"
              />
              <circle cx="120" cy="55" r="14" fill="#111" />
            </svg>
          </div>
        )}

        <div className="product-detail-info">
          <p className="product-detail-eyebrow">
            {category}
            {detail.subcategory && <> &nbsp;•&nbsp; {detail.subcategory}</>}
          </p>
          <h1 className="product-detail-title">{name}</h1>

          <div className="product-detail-rating">
            <span className="product-detail-stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} style={i >= fullStars ? { opacity: 'var(--opacity-muted)' } : undefined} />
              ))}
            </span>
            <span className="product-detail-rating-score">{detail.rating}</span>
            <span className="product-detail-rating-count">({detail.reviewCount} reviews)</span>
          </div>

          <p className="product-detail-desc">{description}</p>

          <div className="product-detail-price-row">
            <span className="product-detail-price-now">{formatCents(priceCents)}</span>
            {hasDiscount && (
              <>
                <span className="product-detail-price-was">{formatCents(originalPriceCents)}</span>
                <span className="badge badge--danger product-detail-discount">{discountPct}% OFF</span>
              </>
            )}
          </div>

          {hasColors && (
            <>
              <p className="product-detail-section-label">
                Color: <b>{selectedColor?.label}</b>
              </p>
              <div className="product-detail-colors" role="group" aria-label={`${name} color`}>
                {colorways.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`product-detail-color-swatch${c.id === selectedColorId ? ' active' : ''}`}
                    style={{ background: c.hex }}
                    aria-label={c.label}
                    aria-pressed={c.id === selectedColorId}
                    onClick={() => setSelectedColorId(c.id)}
                  />
                ))}
              </div>
            </>
          )}

          {detail.sizes && (
            <>
              <div className="product-detail-size-head">
                <span className="product-detail-section-label">
                  <b>Select Size</b>
                </span>
                <span className="product-detail-size-guide">Size guide</span>
              </div>
              <div className="product-detail-sizes" role="group" aria-label="Size">
                {detail.sizes.map((size) => {
                  const unavailable = detail.unavailableSizes?.includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`product-detail-size${size === selectedSize ? ' active' : ''}${unavailable ? ' unavailable' : ''}`}
                      disabled={unavailable}
                      aria-pressed={size === selectedSize}
                      aria-label={unavailable ? `Size ${size}, out of stock` : `Size ${size}`}
                      onClick={() => setSelectedSize(size)}
                    >
                      {size}
                      {size === selectedSize && <CheckIcon className="product-detail-size-check" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <Link to="/bag" className="product-detail-add-btn">
            <CartIcon /> Add to Bag
          </Link>
          <button
            type="button"
            className={`product-detail-wishlist-btn${wishlisted ? ' active' : ''}`}
            aria-pressed={wishlisted}
            onClick={handleWishlistClick}
          >
            <span className="product-detail-wishlist-icon">
              <svg viewBox="0 0 24 24" width="17" height="17" className="svg-outline" aria-hidden="true">
                <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z" />
              </svg>
              <svg viewBox="0 0 24 24" width="17" height="17" className="svg-filled" aria-hidden="true">
                <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z" />
              </svg>
              <svg viewBox="0 0 100 100" width={100} height={100} className="svg-celebrate" aria-hidden="true">
                <polygon points="10,10 20,20" />
                <polygon points="10,50 20,50" />
                <polygon points="20,80 30,70" />
                <polygon points="90,10 80,20" />
                <polygon points="90,50 80,50" />
                <polygon points="80,80 70,70" />
              </svg>
              {hearts.map((h) => (
                <svg
                  key={h.id}
                  viewBox="0 0 24 24"
                  className="heart-burst heart-burst--dialog"
                  style={{
                    width: `${h.size}px`,
                    height: `${h.size}px`,
                    '--burst-color': h.color,
                    '--burst-x': `${h.x}px`,
                    '--burst-rot': `${h.rotate}deg`,
                    '--burst-rise': `${h.rise}px`,
                    '--burst-duration': `${h.duration}s`,
                  }}
                  onAnimationEnd={() => removeHeart(h.id)}
                  aria-hidden="true"
                >
                  <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z" />
                </svg>
              ))}
            </span>
            Wishlist
          </button>

          <div className="product-detail-perks">
            <div className="product-detail-perk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              Free shipping
            </div>
            <div className="product-detail-perk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              30-day returns
            </div>
            <div className="product-detail-perk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
              1-year warranty
            </div>
          </div>
        </div>
      </div>

      <div className="product-detail-tabs">
        <div className="product-detail-tab-row" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className={`product-detail-tab${activeTab === tab.key ? ' active' : ''}`}
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="product-detail-tab-panel" role="tabpanel">
          {activeTab === 'description' && <p>{description}</p>}
          {activeTab === 'specs' && (
            <ul className="product-detail-spec-list">
              {detail.specs.map((spec) => (
                <li key={spec.label}>
                  <span>{spec.label}</span>
                  <span>{spec.value}</span>
                </li>
              ))}
            </ul>
          )}
          {activeTab === 'shipping' && (
            <ul className="product-detail-spec-list">
              <li><span>Shipping</span><span>Free standard shipping, 3–5 business days</span></li>
              <li><span>Returns</span><span>Unused items accepted within 30 days of delivery</span></li>
              <li><span>Warranty</span><span>1 year against manufacturing defects</span></li>
            </ul>
          )}
          {activeTab === 'reviews' && (
            <div className="product-detail-reviews-summary">
              <span className="product-detail-stars">
                {[0, 1, 2, 3, 4].map((i) => (
                  <StarIcon key={i} style={i >= fullStars ? { opacity: 'var(--opacity-muted)' } : undefined} />
                ))}
              </span>
              <p>
                {detail.rating} out of 5, based on {detail.reviewCount} reviews. Individual reviews aren't available yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
