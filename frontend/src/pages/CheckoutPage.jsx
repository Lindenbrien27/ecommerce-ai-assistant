import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, TrashIcon } from '../components/icons.jsx';
import { formatCents } from '../utils/pricing.js';

// Simulated only - this app has no real checkout backend to actually
// submit to, so Continue just shows this loading treatment for a beat
// before settling back to idle, rather than advancing the step indicator
// above to a step (Delivery) that has no real content behind it yet (see
// CheckoutPage's own STEPS comment).
const PROCESSING_MS = 1600;

// Fabricated checkout content, same tier as ShopNowDialog's AirBuds White
// and Cloud Shift Runner itself - this app has no real cart/checkout
// backend, so the two line items and their math below are invented but
// internally consistent (24800 + 8600 subtotal, minus the 1800 promo
// discount, plus 2765 estimated tax, lands on the same $343.65 total the
// approved design shows).
const CART_ITEMS = [
  { id: 'jacket', name: 'Leather Biker Jacket', meta: 'Black · M · Qty 1', priceCents: 24800 },
  { id: 'tank', name: 'Ribbed Tank Set', meta: 'Chalk · S · Qty 1', priceCents: 8600, originalPriceCents: 11800 },
];
const SUBTOTAL_CENTS = 33400;
const TAX_CENTS = 2765;
const DISCOUNT_CENTS = 1800;
const TOTAL_CENTS = 34365;

// Only the Customer step (1 of 4) has real content - Delivery/Payment/
// Review exist as labels in the stepper only, matching the source design,
// which likewise only shows this one step filled in. Not a working
// multi-step wizard yet.
const STEPS = ['Customer', 'Delivery', 'Payment', 'Review'];

export function CheckoutPage() {
  const [isProcessing, setIsProcessing] = useState(false);

  function handleContinueClick() {
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), PROCESSING_MS);
  }

  return (
    <div className="checkout-root">
      <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
        <Link to="/shop">Store</Link>
        <ChevronRightIcon aria-hidden="true" />
        <Link to="/bag">Bag</Link>
        <ChevronRightIcon aria-hidden="true" />
        <span aria-current="page">Checkout</span>
      </nav>

      <div className="checkout-top">
        <div className="checkout-heading">
          <h1>Checkout</h1>
          <p>Confirm shipping, payment, and order details.</p>
        </div>
        <Link to="/shop" className="checkout-btn-primary">
          Continue Shopping <ChevronRightIcon aria-hidden="true" />
        </Link>
      </div>

      <ol className="checkout-steps">
        {STEPS.map((step, i) => (
          <li key={step} className={`checkout-step${i === 0 ? ' active' : ''}`}>
            <span className="checkout-step-num">{i + 1}</span> {step}
            {i < STEPS.length - 1 && <span className="checkout-step-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="checkout-layout">
        <div className="checkout-form">
          <h3 className="checkout-section-heading">Customer Details</h3>
          <p className="checkout-section-sub">Use details that can receive receipts and shipment changes.</p>

          <div className="checkout-field-row">
            <label className="checkout-field">
              First Name
              <input type="text" defaultValue="Morgan" />
            </label>
            <label className="checkout-field">
              Last Name
              <input type="text" defaultValue="Lee" />
            </label>
          </div>
          <div className="checkout-field-row">
            <label className="checkout-field">
              Email
              <input type="email" defaultValue="morgan.lee@example.com" />
            </label>
            <label className="checkout-field">
              Phone
              <input type="text" defaultValue="(415) 555-0148" />
            </label>
          </div>
          <p className="checkout-field-hint">Receipts and shipment changes are sent here.</p>
          <label className="checkout-field checkout-field-country">
            Country
            <select defaultValue="US">
              <option value="US">🇺🇸 United States</option>
            </select>
          </label>

          <hr className="checkout-divider" />

          <h3 className="checkout-section-heading">Account Options</h3>
          <p className="checkout-section-sub">Sign in or create an account after checkout.</p>

          <div className="checkout-account-grid">
            <div className="checkout-account-card">
              <h4>Returning Customer</h4>
              <p>Use saved checkout details.</p>
              <label className="checkout-field">
                Email
                <input type="email" defaultValue="morgan.lee@example.com" />
              </label>
              <label className="checkout-field">
                <span className="checkout-field-label-row">
                  Password <a href="#reset">Reset Password</a>
                </span>
                <input type="password" placeholder="Enter password" />
              </label>
              <button type="button" className="checkout-btn-secondary">
                Sign In <ChevronRightIcon aria-hidden="true" />
              </button>
            </div>

            <div className="checkout-account-card">
              <h4>Create Account</h4>
              <p>Save details for next time.</p>
              <label className="checkout-check-row">
                <input type="checkbox" />
                <span>
                  <strong>Create Account After Checkout</strong>
                  <em>Uses morgan.lee@example.com.</em>
                </span>
              </label>
              <label className="checkout-field">
                New Password
                <input type="password" placeholder="8+ characters" />
              </label>
              <label className="checkout-check-row">
                <input type="checkbox" />
                <span>
                  <strong>Email Order Perks</strong>
                </span>
              </label>
              <button type="button" className="checkout-btn-secondary">Create With Order</button>
            </div>
          </div>

          <div className="checkout-continue-row">
            <button
              type="button"
              className="checkout-btn-primary"
              onClick={handleContinueClick}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <span className="checkout-spinner" aria-hidden="true">
                    <span /><span /><span /><span /><span /><span />
                    <span /><span /><span /><span /><span /><span />
                    <span className="checkout-spinner-num">1</span>
                  </span>
                  Processing…
                </>
              ) : (
                <>Continue <ChevronRightIcon aria-hidden="true" /></>
              )}
            </button>
          </div>
        </div>

        <aside className="checkout-summary">
          <h3>Order Summary</h3>
          <p className="checkout-summary-sub">{CART_ITEMS.length} items shipping to Home</p>

          {CART_ITEMS.map((item) => (
            <div className="checkout-item" key={item.id}>
              <div>
                <p className="checkout-item-name">{item.name}</p>
                <p className="checkout-item-meta">{item.meta}</p>
              </div>
              <div className="checkout-item-price">
                {formatCents(item.priceCents)}
                {item.originalPriceCents && (
                  <span className="checkout-item-was">{formatCents(item.originalPriceCents)}</span>
                )}
                <button type="button" className="checkout-item-trash" aria-label={`Remove ${item.name}`}>
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}

          <hr className="checkout-divider" />

          <label className="checkout-field">
            Promo Code
            <span className="checkout-promo-row">
              <input type="text" defaultValue="SPRING15" />
              <button type="button" className="checkout-btn-secondary">Apply</button>
            </span>
          </label>
          <p className="checkout-promo-applied">SPRING15 applied for {formatCents(DISCOUNT_CENTS)} off.</p>

          <hr className="checkout-divider" />

          <div className="checkout-summary-row"><span>Subtotal</span><span>{formatCents(SUBTOTAL_CENTS)}</span></div>
          <div className="checkout-summary-row"><span>Delivery</span><span>Free</span></div>
          <div className="checkout-summary-row"><span>Estimated Tax</span><span>{formatCents(TAX_CENTS)}</span></div>
          <div className="checkout-summary-row discount"><span>Discount</span><span>-{formatCents(DISCOUNT_CENTS)}</span></div>

          <div className="checkout-total-box">
            <div className="checkout-total-top">
              <div>
                <strong>Total</strong>
                <p className="checkout-total-sub">Delivery, promo, and tax included.</p>
              </div>
              <div className="checkout-total-amount">{formatCents(TOTAL_CENTS)}</div>
            </div>
            <div className="checkout-total-bottom">
              <span>Charged after review</span>
              <span className="checkout-ready-pill">Ready to place</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
