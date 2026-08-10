import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartIcon, CheckIcon, StarIcon, XIcon } from './icons.jsx';

const FINISHES = ['Pearl', 'Frost', 'Cloud', 'Sand', 'Mist'];
const FEATURES = ['Open-Fit Comfort', 'Low-Latency Pairing', 'Slim Charging Case'];

// Like Reaction Floating Particle Effect's color palette - same set
// ProductCard uses (see its own HEART_COLORS comment) - vivid pink, red,
// purple, coral, light orange, randomized per particle.
const HEART_COLORS = ['#ff2d78', '#ef4444', '#a855f7', '#ff6b6b', '#ff9f43'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// A one-off promotional dialog, not a product-grid item - AirBuds White
// isn't in SHOP_PRODUCTS (see data/shopProducts.js), so its copy/rating/
// stock count live here as plain content rather than fields the real
// catalog schema would need to grow to support one promo card.
export function ShopNowDialog({ onClose }) {
  const [finish, setFinish] = useState('Cloud');
  const [wishlisted, setWishlisted] = useState(false);

  // Like Reaction Floating Particle Effect - same particle system
  // ProductCard's photo/corner-button taps use (see .heart-burst in
  // index.css), duplicated locally rather than extracted into a shared
  // hook: this dialog is a one-off promo, not a second reusable card, and
  // the two components don't share a wishlisted-toggle shape to hang a
  // hook off of (ProductCard's is lifted to ShopPage; this one's local).
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

  return (
    <div className="shop-now-scrim" onClick={onClose}>
      <div
        className="shop-now-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-now-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="shop-now-close" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>

        <div className="shop-now-content">
          <div className="shop-now-eyebrow">
            <span>Audio</span>
            <span className="shop-now-tooltip-wrap">
              <span className="shop-now-stock-badge" tabIndex={0} aria-describedby="shop-now-stock-tip">
                Popular · 6 left
              </span>
              <span className="shop-now-tooltip" role="tooltip" id="shop-now-stock-tip">
                The last {finish} batch sold out in under 2 days — restocks land every other Friday.
              </span>
            </span>
          </div>

          <h2 className="shop-now-title" id="shop-now-title">AirBuds White</h2>
          <p className="shop-now-desc">
            White wireless earbuds with open-fit comfort, fast pairing, and a slim pocket charging case.
          </p>

          <div className="shop-now-rating">
            <span className="shop-now-stars">
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon />
              <StarIcon style={{ opacity: 'var(--opacity-muted)' }} />
            </span>
            <span className="shop-now-rating-score">4.7</span>
            <span className="shop-now-rating-count">362 reviews</span>
          </div>

          <div className="shop-now-price-row">
            <span className="badge badge--danger shop-now-discount">18% OFF</span>
            <span className="shop-now-price-now">$119.00</span>
            <span className="shop-now-price-was">$149.00</span>
          </div>

          <ul className="shop-now-features">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <CheckIcon /> {feature}
              </li>
            ))}
          </ul>

          <div className="shop-now-finish-block">
            <div className="shop-now-finish-head">
              <span>Finish</span>
              <span className="shop-now-tech-specs">Tech Specs</span>
            </div>
            <div className="shop-now-swatch-row">
              {FINISHES.map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`shop-now-swatch${finish === label ? ' active' : ''}`}
                  aria-pressed={finish === label}
                  onClick={() => setFinish(label)}
                >
                  {label}
                  {finish === label && <CheckIcon className="shop-now-swatch-check" />}
                </button>
              ))}
            </div>
          </div>

          <div className="shop-now-actions">
            <Link to="/bag" className="shop-now-add-btn">
              <CartIcon /> Add to Bag
            </Link>
            <button
              type="button"
              className={`shop-now-wishlist-btn${wishlisted ? ' active' : ''}`}
              aria-pressed={wishlisted}
              onClick={handleWishlistClick}
            >
              <span className="shop-now-wishlist-icon">
                <svg viewBox="0 0 24 24" width="16" height="16" className="svg-outline" aria-hidden="true">
                  <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z" />
                </svg>
                <svg viewBox="0 0 24 24" width="16" height="16" className="svg-filled" aria-hidden="true">
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
          </div>
        </div>

        <div className="shop-now-media">
          <img src="/images/products/earbuds-wood-table-d-MoiV98pc-unsplash.jpg" alt="AirBuds White earbuds and charging case" />
        </div>
      </div>
    </div>
  );
}
