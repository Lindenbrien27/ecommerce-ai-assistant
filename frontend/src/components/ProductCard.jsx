import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductImage } from './ProductImage.jsx';
import { PRODUCT_DETAILS } from '../data/productDetails.js';
import { formatCents } from '../utils/pricing.js';

// Like Reaction Floating Particle Effect's color palette - vivid pink,
// red, purple, coral, light orange. Randomized per particle rather than
// this app's single fixed --color-badge-danger red, since a flurry of
// identically-colored hearts reads as flat next to the varied-hue TikTok/
// IG Live reaction this is modeled on.
const HEART_COLORS = ['#ff2d78', '#ef4444', '#a855f7', '#ff6b6b', '#ff9f43'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// One card in ShopPage's grid. Wishlist state lives in ShopPage (a Set of
// product ids), not here, so toggling one card's heart can't accidentally
// affect any other card's render - but which colorway swatch is selected
// is purely cosmetic, per-card, and never read by anything outside this
// component, so that one piece of state stays local.
export function ProductCard({ product, wishlisted, onToggleWishlist }) {
  const { name, category, description, price_cents: priceCents, original_price_cents: originalPriceCents, colorways } = product;
  const hasDiscount = originalPriceCents != null;
  const discountPct = hasDiscount ? Math.round((1 - priceCents / originalPriceCents) * 100) : 0;

  const [selectedColorId, setSelectedColorId] = useState(colorways[0]?.id ?? null);
  const selectedColor = colorways.find((c) => c.id === selectedColorId);

  // TikTok/Instagram-style tap flurry - every tap spawns its own heart
  // particle (random drift/rotation/size) rather than one shared element
  // replaying in place, so spam-tapping stacks several simultaneously-
  // flying hearts instead of one burst interrupting the last. Two
  // triggers share this same particle system: double-tapping the photo
  // (origin 'center', see handleImageDoubleClick) and single-tapping the
  // corner button (origin 'button', see handleWishlistClick) - the
  // button's own outline/filled/celebrate pop (.product-card-wishlist)
  // still separately signals the resulting like/unlike state; these
  // particles are just each tap's own decorative flourish and never
  // affect wishlisted itself. Particles remove themselves from state via
  // onAnimationEnd once they've faded out, so the DOM doesn't accumulate
  // them across a long spam-tapping session; the slice(-11) cap is a
  // backstop for the rare case an animationend event gets dropped (e.g.
  // the tab was backgrounded mid-animation).
  const [hearts, setHearts] = useState([]);
  const heartIdRef = useRef(0);
  // One "last tap" timestamp per trigger (image vs. button) - each spam-
  // tapping session should escalate independently instead of a fast tap
  // on one silently counting toward the other's threshold.
  const lastImageTapAtRef = useRef(0);
  const lastButtonTapAtRef = useRef(0);

  // spawnPoint is only meaningful for origin 'center' - the photo case
  // spawns at the exact tap coordinates (like tapping a video), while the
  // button case spawns from its own fixed CSS anchor (like a persistent
  // LIVE reaction control) and ignores this argument entirely.
  function spawnHeart(origin, lastTapAtRef, spawnPoint) {
    const now = performance.now();
    // Under 30ms only happens when taps themselves are landing back-to-
    // back (true spam-tapping, not just "one normal tap"), and gets the
    // taller rise and longer duration below instead of a normal tap's.
    const isSpam = now - lastTapAtRef.current < 30;
    lastTapAtRef.current = now;
    heartIdRef.current += 1;
    const particle = {
      id: heartIdRef.current,
      origin,
      left: spawnPoint?.x,
      top: spawnPoint?.y,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: Math.round(randomBetween(32, 64)),
      x: Math.round(randomBetween(-45, 45)),
      rotate: Math.round(randomBetween(-15, 15)),
      rise: isSpam ? -Math.round(randomBetween(240, 320)) : -Math.round(randomBetween(140, 210)),
      duration: isSpam ? Number(randomBetween(2.2, 3).toFixed(2)) : Number(randomBetween(1.5, 2.2).toFixed(2)),
    };
    // Cap raised from the old 11 to 23 - durations now run up to 3s
    // (vs. the old fixed ~1.1-1.5s), so a sustained spam-tapping session
    // legitimately has more particles in flight at once before any of
    // them finish and self-remove via onAnimationEnd.
    setHearts((prev) => [...prev.slice(-23), particle]);
  }

  function handleImageDoubleClick(e) {
    if (!wishlisted) onToggleWishlist();
    const rect = e.currentTarget.getBoundingClientRect();
    spawnHeart('center', lastImageTapAtRef, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleWishlistClick() {
    onToggleWishlist();
    spawnHeart('button', lastButtonTapAtRef);
  }

  function removeHeart(id) {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <article className="product-card">
      <div className="product-card-media">
        <div className="product-card-image-tap" onDoubleClick={handleImageDoubleClick}>
          <ProductImage icon={product.icon} size="xl" />
        </div>
        {hasDiscount && (
          <span className="badge badge--danger product-card-discount">-{discountPct}%</span>
        )}
        <button
          type="button"
          className={`product-card-wishlist${wishlisted ? ' active' : ''}`}
          onClick={handleWishlistClick}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
        >
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
        </button>
        {hearts.map((h) => (
          <svg
            key={h.id}
            viewBox="0 0 24 24"
            className={`heart-burst heart-burst--${h.origin}`}
            style={{
              ...(h.left != null ? { left: `${h.left}px`, top: `${h.top}px` } : null),
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
      </div>

      <div className="product-card-body">
        <p className="product-card-category">{category}</p>

        {colorways.length > 0 && (
          <div className="product-card-swatches">
            <div className="product-card-swatch-group" role="group" aria-label={`${name} color`}>
              {colorways.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`product-card-swatch${c.id === selectedColorId ? ' active' : ''}`}
                  style={{ background: c.hex }}
                  aria-label={c.label}
                  aria-pressed={c.id === selectedColorId}
                  onClick={() => setSelectedColorId(c.id)}
                />
              ))}
            </div>
            <span className="product-card-swatch-label">{selectedColor?.label}</span>
          </div>
        )}

        {/* Only cards with a real detail page get a link here - every
            other product's heading stays plain text, same as today,
            rather than linking to a page with no real content behind it.
            The name/description block specifically (not the image, which
            already has its own double-tap-to-wishlist gesture, and not
            the swatches/wishlist button, which are their own controls) is
            the click target, so there's no bubbling conflict with any of
            those. */}
        {PRODUCT_DETAILS[product.slug] ? (
          <Link to={`/shop/${product.slug}`} className="product-card-heading product-card-heading-link">
            <h3 className="product-card-name">{name}</h3>
            <p className="product-card-description">{description}</p>
          </Link>
        ) : (
          <div className="product-card-heading">
            <h3 className="product-card-name">{name}</h3>
            <p className="product-card-description">{description}</p>
          </div>
        )}

        <p className="product-card-price">
          {formatCents(priceCents)}
          {hasDiscount && (
            <span className="product-card-price-original">{formatCents(originalPriceCents)}</span>
          )}
        </p>
      </div>
    </article>
  );
}
