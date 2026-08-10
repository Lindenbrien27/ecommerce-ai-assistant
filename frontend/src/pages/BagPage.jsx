import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProductImage } from '../components/ProductImage.jsx';
import { ChevronRightIcon, LockIcon, ShopIcon, TruckIcon, XIcon } from '../components/icons.jsx';
import { useCart } from '../context/CartContext.jsx';
import { SHOP_PRODUCTS } from '../data/shopProducts.js';
import { formatCents } from '../utils/pricing.js';

function findProduct(productId) {
  return SHOP_PRODUCTS.find((p) => p.id === productId);
}

export function BagPage() {
  const navigate = useNavigate();
  // Shared with Layout's own sidebar badge (see CartContext.jsx) - reading
  // from context here instead of a page-local useState is what keeps that
  // badge in sync with whatever this page does (remove an item, and the
  // sidebar count drops immediately) rather than a page-local list that
  // silently resets to the same 3 seed items every time this page
  // remounts.
  const { items, setItems } = useCart();
  const selectAllRef = useRef(null);

  const selectedCount = items.filter((it) => it.selected).length;

  // indeterminate has no JSX/HTML attribute equivalent - it only exists as
  // a DOM property, so it has to be set imperatively here rather than
  // passed as a prop the way checked is below.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < items.length;
    }
  }, [selectedCount, items.length]);

  function handleSelectAllClick() {
    const allSelected = items.every((it) => it.selected);
    setItems((prev) => prev.map((it) => ({ ...it, selected: !allSelected })));
  }

  function toggleSelect(productId) {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, selected: !it.selected } : it)));
  }

  function setFulfillment(productId, fulfillment) {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, fulfillment } : it)));
  }

  function changeQty(productId, delta) {
    setItems((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  }

  const deliveryTotal = items.filter((it) => it.fulfillment === 'delivery').length;
  const pickupTotal = items.filter((it) => it.fulfillment === 'pickup').length;

  const selectedItems = items.filter((it) => it.selected);
  const subtotalCents = selectedItems.reduce((sum, it) => sum + findProduct(it.productId).priceCents * it.qty, 0);
  const deliverySelected = selectedItems.filter((it) => it.fulfillment === 'delivery');
  const pickupSelected = selectedItems.filter((it) => it.fulfillment === 'pickup');
  const deliveryCents = deliverySelected.reduce((sum, it) => sum + it.surchargeCents, 0);
  const discountCents = Math.round(subtotalCents * 0.15);
  const taxCents = Math.round((subtotalCents - discountCents + deliveryCents) * 0.07);
  const totalCents = subtotalCents - discountCents + deliveryCents + taxCents;

  return (
    <div className="cart-root">
      <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
        <Link to="/shop">Shop</Link>
        <ChevronRightIcon aria-hidden="true" />
        <span aria-current="page">Bag</span>
      </nav>

      <div className="cart-top">
        <div>
          <h1 className="cart-title">
            Shopping Bag <span className="cart-count">{items.length}</span>
          </h1>
          {items.length > 0 && (
            <p className="cart-fulfillment-sub">
              {deliveryTotal > 0 && (
                <span>
                  <TruckIcon aria-hidden="true" /> {deliveryTotal} ready Feb 1
                </span>
              )}
              {deliveryTotal > 0 && pickupTotal > 0 && <span aria-hidden="true">&middot;</span>}
              {pickupTotal > 0 && (
                <span>
                  <ShopIcon aria-hidden="true" /> {pickupTotal} ready today
                </span>
              )}
            </p>
          )}
        </div>
        <Link to="/shop" className="cart-btn-primary">
          Continue Shopping <ChevronRightIcon aria-hidden="true" />
        </Link>
      </div>

      <div className="cart-layout">
        <div>
          {items.length > 0 && (
            <div className="cart-select-all-row">
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={selectedCount === items.length}
                onChange={handleSelectAllClick}
                id="cart-select-all"
                className="cart-item-check"
              />
              <label htmlFor="cart-select-all">
                Select all ({selectedCount}/{items.length})
              </label>
            </div>
          )}

          {items.map((item) => {
            const product = findProduct(item.productId);
            return (
              <div className={`cart-item${item.selected ? '' : ' unselected'}`} key={item.productId}>
                <input
                  type="checkbox"
                  className="cart-item-check"
                  checked={item.selected}
                  onChange={() => toggleSelect(item.productId)}
                  aria-label={`Include ${product.name}`}
                />
                <ProductImage icon={product.icon} size="lg" />
                <div className="cart-item-body">
                  <div className="cart-item-top">
                    <div>
                      <p className="cart-item-name">{product.name}</p>
                      <p className="cart-item-color">Color &middot; {item.colorLabel}</p>
                    </div>
                    <button
                      type="button"
                      className="cart-item-remove"
                      aria-label={`Remove ${product.name}`}
                      onClick={() => removeItem(item.productId)}
                    >
                      <XIcon aria-hidden="true" />
                    </button>
                  </div>

                  <div className="cart-fulfill-row">
                    <button
                      type="button"
                      className={`cart-fulfill-badge${item.fulfillment === 'delivery' ? ' active' : ''}`}
                      onClick={() => setFulfillment(item.productId, 'delivery')}
                    >
                      <TruckIcon aria-hidden="true" /> Feb 1{' '}
                      {item.surchargeCents > 0 ? `+${formatCents(item.surchargeCents)}` : 'Free'}
                    </button>
                    <button
                      type="button"
                      className={`cart-fulfill-badge${item.fulfillment === 'pickup' ? ' active' : ''}`}
                      onClick={() => setFulfillment(item.productId, 'pickup')}
                    >
                      <ShopIcon aria-hidden="true" /> Today Free
                    </button>
                  </div>

                  <div className="cart-item-bottom">
                    <div className="cart-qty">
                      <button type="button" onClick={() => changeQty(item.productId, -1)} aria-label="Decrease quantity">
                        &minus;
                      </button>
                      <span>{item.qty}</span>
                      <button type="button" onClick={() => changeQty(item.productId, 1)} aria-label="Increase quantity">
                        +
                      </button>
                    </div>
                    <div className="cart-item-price">{formatCents(product.priceCents * item.qty)}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && <p className="cart-empty">Your bag is empty.</p>}

          <div className="cart-footer-row">
            <Link to="/shop">&larr; Back to Catalog</Link>
            <span>
              <ShopIcon aria-hidden="true" /> Free pickup at any store &middot; Toggle per item
            </span>
          </div>
        </div>

        <aside className="cart-summary">
          <div className="cart-summary-head">
            <strong>Order Total</strong>
            <span>Estimated</span>
          </div>
          <div className="cart-summary-total">{formatCents(totalCents)}</div>
          {discountCents > 0 && (
            <div className="cart-saved-pill">You saved {formatCents(discountCents)}</div>
          )}

          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatCents(subtotalCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Delivery{deliverySelected.length > 0 ? ` ${deliverySelected.length} item${deliverySelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>{deliveryCents > 0 ? `+${formatCents(deliveryCents)}` : 'Free'}</span>
          </div>
          <div className="cart-summary-row">
            <span>Pickup{pickupSelected.length > 0 ? ` ${pickupSelected.length} item${pickupSelected.length > 1 ? 's' : ''}` : ''}</span>
            <span>Free</span>
          </div>
          <div className="cart-summary-row discount">
            <span>Promo (15%)</span>
            <span>-{formatCents(discountCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Tax 7%</span>
            <span>{formatCents(taxCents)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Promo code</span>
            <span className="cart-promo-pill">&#10003; HAPPY2026</span>
          </div>

          <hr className="cart-divider" />
          <div className="cart-summary-final">
            <span>Total</span>
            <span>{formatCents(totalCents)}</span>
          </div>

          <div className="cart-checkout-box">
            <button
              type="button"
              className="cart-btn-primary cart-checkout-btn"
              disabled={subtotalCents === 0}
              onClick={() => navigate('/checkout')}
            >
              <LockIcon aria-hidden="true" /> Checkout Securely
            </button>
            <p className="cart-summary-foot">
              <LockIcon aria-hidden="true" /> Encrypted checkout &middot; 60-day returns
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
