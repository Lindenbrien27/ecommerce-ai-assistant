import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartIcon, XIcon } from './icons.jsx';

const FINISHES = [
  { name: 'Pearl', swatch: '#f1ece0', material: 'warm ivory ABS, soft-touch finish' },
  { name: 'Frost', swatch: '#dfe6ea', material: 'cool pale grey-blue ABS, matte' },
  { name: 'Cloud', swatch: '#e7e6df', material: 'neutral warm-white ABS, satin' },
  { name: 'Sand', swatch: '#d8c9ab', material: 'warm taupe ABS, matches oak and walnut' },
  { name: 'Mist', swatch: '#d6d0dd', material: 'soft lavender-grey ABS, matte' },
];

const FEATURES = ['Open-fit comfort', 'Low-latency pairing', 'Slim charging case'];

export function ShopNowDialog({ onClose }) {
  const [finishIndex, setFinishIndex] = useState(0);
  const [wishlisted, setWishlisted] = useState(false);
  const finish = FINISHES[finishIndex];

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

        <div className="shop-now-media">
          <img src="/images/products/earbuds-wood-table-d-MoiV98pc-unsplash.jpg" alt="AirBuds White earbuds and charging case" />
          <p className="shop-now-media-caption">AirBuds White — shown in Pearl</p>
        </div>

        <div className="shop-now-content">
          <h2 className="shop-now-title" id="shop-now-title">
            The pair that lives on your table, <em>not in a drawer.</em>
          </h2>
          <p className="shop-now-desc">
            Open-fit comfort, low-latency pairing, and a slim charging case — small enough to leave out,
            good-looking enough that you will.
          </p>

          <div className="shop-now-rating">
            <span className="shop-now-stars" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <svg key={i} viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L10 15l-5.6 3.1L5.8 11.8 1 7.5l6.4-.6z" />
                </svg>
              ))}
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 'var(--opacity-muted)' }}>
                <path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L10 15l-5.6 3.1L5.8 11.8 1 7.5l6.4-.6z" />
              </svg>
            </span>
            <span className="shop-now-rating-score">4.7</span>
            <span>362 reviews</span>
          </div>

          <div className="shop-now-price-row">
            <span className="shop-now-price-now">$119.00</span>
            <span className="shop-now-price-was">$149.00</span>
            <span className="shop-now-discount">18% off</span>
          </div>

          <ul className="shop-now-features">
            {FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>

          <div className="shop-now-finish-block">
            <p className="shop-now-finish-head">Finish — 5 shades of white</p>
            <div className="shop-now-swatch-row" role="group" aria-label="Choose a finish">
              {FINISHES.map((f, i) => (
                <button
                  key={f.name}
                  type="button"
                  className={`shop-now-swatch${i === finishIndex ? ' active' : ''}`}
                  style={{ '--swatch-color': f.swatch }}
                  aria-pressed={i === finishIndex}
                  onClick={() => setFinishIndex(i)}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </button>
              ))}
            </div>
            <p className="shop-now-specimen-label">
              <b>
                {String(finishIndex + 1).padStart(2, '0')} — {finish.name}
              </b>{' '}
              <span>{finish.material}</span>
            </p>
          </div>

          <div className="shop-now-actions">
            <Link to="/bag" className="shop-now-add-btn">
              <CartIcon /> Add to bag
            </Link>
            <button
              type="button"
              className={`shop-now-wishlist-btn${wishlisted ? ' active' : ''}`}
              aria-pressed={wishlisted}
              onClick={() => setWishlisted((w) => !w)}
            >
              <span className="shop-now-wishlist-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 5 5.5 5c2 0 3.5 1.2 4.5 2.7C11 6.2 12.5 5 14.5 5 18 5 19.5 8.4 18 11.9 15.5 16.4 12 21 12 21z" />
                </svg>
              </span>
              {wishlisted ? 'Saved' : 'Save'}
            </button>
          </div>

          <p className="shop-now-stock">
            Back in stock this week — around <b>6 left</b> in {finish.name}.
          </p>
        </div>
      </div>
    </div>
  );
}
