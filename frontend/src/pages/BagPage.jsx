import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProductImage } from '../components/ProductImage.jsx';
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  HeartIcon,
  LockIcon,
  ShopIcon,
  TrashIcon,
  TruckIcon,
  UndoIcon,
  XIcon,
} from '../components/icons.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { formatCents } from '../utils/pricing.js';

// How long a press-and-hold on the confirm dialog's Remove button takes to
// actually delete the item - releasing before this fires cancels instead
// (see startHold/cancelHold below). Matches ROW_EXIT_MS's own role: both
// are timing constants the JS setTimeout calls need to agree with, one
// with the CSS transition duration on .remove-btn.holding .remove-fill
// (index.css), the other with .cart-item.leaving's own transition.
const REMOVE_HOLD_MS = 1500;
const ROW_EXIT_MS = 320;
// Undo toast dwell time - restarts from this full duration every time the
// mouse leaves it (see UndoToast below), rather than resuming whatever
// time was left when the hover started.
const UNDO_TOAST_MS = 6000;

// toast.custom hands back an id, not a data prop - id/productName/onUndo
// are threaded through as plain props instead. duration: Infinity on the
// toast.custom() call (see completeRemoval) hands the entire timing/pause
// contract to this component instead of Sonner's own per-toast timer,
// which only supports pause-then-resume, not "start over from 6s" on
// mouseleave.
function UndoToast({ id, productName, onUndo }) {
  const timerRef = useRef(null);

  function startTimer() {
    timerRef.current = setTimeout(() => toast.dismiss(id), UNDO_TOAST_MS);
  }

  useEffect(() => {
    startTimer();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUndo() {
    clearTimeout(timerRef.current);
    toast.dismiss(id);
    onUndo();
  }

  return (
    <div
      className="cart-undo-toast"
      onMouseEnter={() => clearTimeout(timerRef.current)}
      onMouseLeave={() => {
        clearTimeout(timerRef.current);
        startTimer();
      }}
    >
      <span className="cart-undo-toast-text">{productName} removed</span>
      <button type="button" className="cart-undo-toast-btn" onClick={handleUndo}>
        <UndoIcon aria-hidden="true" />
        Undo
      </button>
    </div>
  );
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
  const { products, error, findProduct } = useProducts();
  const selectAllRef = useRef(null);

  // confirmProductId drives the alert dialog itself; leavingProductId is
  // separate so the row can play its own fade-out (see .cart-item.leaving)
  // for ROW_EXIT_MS before removeItem actually drops it from context -
  // removing it from state immediately would cut the animation off on
  // its very first frame.
  const [confirmProductId, setConfirmProductId] = useState(null);
  const [leavingProductId, setLeavingProductId] = useState(null);
  const [holding, setHolding] = useState(false);
  const holdTimerRef = useRef(null);

  // Joins every cart entry to its live catalog product once, up front -
  // every display/calculation value below (count, totals, surcharge sum)
  // reads from this instead of the raw, unfiltered items array, so a
  // seeded entry whose product the admin has since deleted (findProduct
  // misses) can't silently skew a total or count while still going undone
  // (see completeRemoval) via raw items. Cart-mutation calls (setItems)
  // intentionally keep operating on raw items - this is a display/calc
  // derivation only, not a replacement for cart state itself.
  const resolvedItems = items
    .map((it) => ({ ...it, product: findProduct(it.productId) }))
    .filter((it) => it.product);

  const selectedCount = resolvedItems.filter((it) => it.selected).length;

  // indeterminate has no JSX/HTML attribute equivalent - it only exists as
  // a DOM property, so it has to be set imperatively here rather than
  // passed as a prop the way checked is below.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < resolvedItems.length;
    }
  }, [selectedCount, resolvedItems.length]);

  function handleSelectAllClick() {
    const allSelected = resolvedItems.every((it) => it.selected);
    setItems((prev) => prev.map((it) => ({ ...it, selected: !allSelected })));
  }

  function toggleSelect(productId) {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, selected: !it.selected } : it)));
  }

  function changeQty(productId, delta) {
    setItems((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  }

  function cancelHold() {
    setHolding(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function closeRemoveConfirm() {
    setConfirmProductId(null);
    cancelHold();
  }

  // Snapshotting the item + its index here (not inside the ROW_EXIT_MS
  // setTimeout below) is what lets Undo put it back in the same spot -
  // by the time that timeout fires, removeItem has already run and the
  // item is gone from `items`, so there'd be nothing left to snapshot.
  function completeRemoval(productId) {
    const removedIndex = items.findIndex((it) => it.productId === productId);
    const removedItem = items[removedIndex];
    // Seeded cart entries can point at a slug the admin has since deleted
    // from the catalog - findProduct then returns undefined, so fall back
    // to a generic label rather than crashing on product.name.
    const product = findProduct(productId);
    removeItem(productId);
    setLeavingProductId(null);
    if (!removedItem) return;
    toast.custom(
      (toastId) => (
        <UndoToast
          id={toastId}
          productName={product ? product.name : 'Item'}
          onUndo={() => {
            setItems((prev) => {
              const next = [...prev];
              next.splice(Math.min(removedIndex, next.length), 0, removedItem);
              return next;
            });
          }}
        />
      ),
      { duration: Infinity, unstyled: true }
    );
  }

  function startHold() {
    if (!confirmProductId || holding) return;
    setHolding(true);
    holdTimerRef.current = setTimeout(() => {
      const productId = confirmProductId;
      setConfirmProductId(null);
      setHolding(false);
      setLeavingProductId(productId);
      setTimeout(() => completeRemoval(productId), ROW_EXIT_MS);
    }, REMOVE_HOLD_MS);
  }

  useEffect(() => {
    if (!confirmProductId) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeRemoveConfirm();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmProductId]);

  // Catalog fetch (ProductsContext) hasn't resolved yet - products is null
  // only during that initial load. CartContext's items exist synchronously
  // (see INITIAL_CART_ITEMS), so without this gate the very first render
  // would call findProduct before there's anything to find, crashing on
  // product.name/product.price_cents reads below - same one-time
  // "still loading" gate ProductDetailPage.jsx already uses.
  //
  // A failed fetch also leaves products === null forever, so that alone
  // can't distinguish "still loading" from "load failed" - check error
  // first and render the same inline-error convention ShopPage/
  // AdminProductsPage use instead of hanging on a blank page.
  if (error) {
    return (
      <p className="verify-error" role="alert">
        {error}
      </p>
    );
  }
  if (products === null) return null;

  const confirmProduct = confirmProductId ? findProduct(confirmProductId) : null;

  const deliveryTotal = resolvedItems.filter((it) => it.fulfillment === 'delivery').length;
  const pickupTotal = resolvedItems.filter((it) => it.fulfillment === 'pickup').length;

  // resolvedItems already excludes entries findProduct couldn't resolve
  // (see the derivation above), so it.product is guaranteed here.
  const selectedItems = resolvedItems.filter((it) => it.selected);
  const subtotalCents = selectedItems.reduce((sum, it) => sum + it.product.price_cents * it.qty, 0);
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
        <div className="cart-top-left">
          <div className="cart-title-row">
            <Link to="/wishlist" className="cart-wishlist-btn" aria-label="View wishlist">
              <HeartIcon aria-hidden="true" />
            </Link>
            <h1 className="cart-title">
              Shopping Bag <span className="cart-count">{resolvedItems.length} item(s)</span>
            </h1>
          </div>
          {resolvedItems.length > 0 && (
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
          {resolvedItems.length > 0 && (
            <div className="cart-select-all-row">
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={selectedCount === resolvedItems.length}
                onChange={handleSelectAllClick}
                id="cart-select-all"
                className="cart-item-check"
              />
              <label htmlFor="cart-select-all">
                Select all ({selectedCount}/{resolvedItems.length})
              </label>
            </div>
          )}

          {resolvedItems.map((item) => {
            const { product } = item;
            return (
              <div
                className={`cart-item${item.selected ? '' : ' unselected'}${item.productId === leavingProductId ? ' leaving' : ''}`}
                key={item.productId}
              >
                <input
                  type="checkbox"
                  className="cart-item-check"
                  checked={item.selected}
                  onChange={() => toggleSelect(item.productId)}
                  aria-label={`Include ${product.name}`}
                />
                <ProductImage icon={product.icon} size="lg" />
                <div className="cart-item-body">
                  <div className="cart-item-heading">
                    <p className="cart-item-name">{product.name}</p>
                    <div className="cart-item-heading-right">
                      <div className="cart-item-price">{formatCents(product.price_cents * item.qty)}</div>
                      <button
                        type="button"
                        className="cart-item-remove"
                        aria-label={`Remove ${product.name}`}
                        onClick={() => setConfirmProductId(item.productId)}
                      >
                        <XIcon aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="cart-item-description">{product.description}</p>
                  <div className="cart-item-bottom">
                    <div className="cart-item-status-row">
                      <span className="cart-item-stock-badge">
                        <span className="cart-item-stock-dot" aria-hidden="true" />
                        In Stock
                      </span>
                      <span className="cart-item-arrival">Estimated arrival &middot; Feb 1</span>
                    </div>
                    <div className="cart-item-bottom-right">
                      <button
                        type="button"
                        className="cart-item-wishlist"
                        aria-label={`Save ${product.name} for later`}
                      >
                        <HeartIcon aria-hidden="true" />
                      </button>
                      <div className="cart-qty">
                        <button
                          type="button"
                          onClick={() => changeQty(item.productId, -1)}
                          aria-label="Decrease quantity"
                          disabled={item.qty < 2}
                        >
                          &minus;
                        </button>
                        <span>{item.qty}</span>
                        <button type="button" onClick={() => changeQty(item.productId, 1)} aria-label="Increase quantity">
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {resolvedItems.length === 0 && <p className="cart-empty">Your bag is empty.</p>}

          <div className="cart-footer-row">
            <Link to="/shop">&larr; Back to Catalog</Link>
            <span>
              <ShopIcon aria-hidden="true" /> Free pickup at any store
            </span>
          </div>
        </div>

        <aside className="cart-summary">
          <div className="cart-summary-head">
            <span>Order Total</span>
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

      {confirmProduct && (
        <div
          className="cart-remove-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRemoveConfirm();
          }}
        >
          <div
            className="cart-remove-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cart-remove-question"
            aria-describedby="cart-remove-reminder"
          >
            <p className="cart-remove-reminder" id="cart-remove-reminder">
              <AlertTriangleIcon aria-hidden="true" />
              Press and hold Remove for 1.5s to confirm &mdash; releasing early keeps the item.
            </p>
            <div className="cart-remove-item">
              <ProductImage icon={confirmProduct.icon} size="sm" />
              <span className="cart-remove-item-name">{confirmProduct.name}</span>
            </div>
            <p className="cart-remove-question" id="cart-remove-question">
              Remove this item from your bag?
            </p>
            <div className="cart-remove-actions">
              <button type="button" className="cart-remove-keep" onClick={closeRemoveConfirm}>
                Keep
              </button>
              <button
                type="button"
                className={`cart-remove-btn${holding ? ' holding' : ''}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startHold();
                }}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
              >
                <span className="cart-remove-fill" aria-hidden="true" />
                <span className="cart-remove-label">
                  <TrashIcon aria-hidden="true" />
                  {holding ? 'Keep holding…' : 'Hold to Remove'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
