import { useMemo, useState } from 'react';
import { ProductImage } from '../components/ProductImage.jsx';
import { CartIcon } from '../components/icons.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { WISHLIST_ITEMS } from '../data/wishlistItems.js';
import { formatCents } from '../utils/pricing.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'price-drop', label: 'Price Drop' },
  { key: 'almost-gone', label: 'Almost Gone' },
];

export function WishlistPage() {
  const { setItems } = useCart();
  const { products, findProduct } = useProducts();
  const [activeTab, setActiveTab] = useState('all');
  const [addedIds, setAddedIds] = useState(() => new Set());

  // Joins each saved entry to its live catalog product once, up front -
  // every derived value below (priceDropped, savings, filtering) reads
  // from this instead of calling findProduct repeatedly per render.
  // Catalog fetch (ProductsContext) hasn't resolved yet - products is null
  // only during that initial load, and findProduct returns undefined for
  // every entry until it settles - gated here (inside the memo, since
  // hooks can't be skipped conditionally) rather than crashing on
  // product.price_cents below, same one-time "still loading" gate
  // ProductDetailPage.jsx already uses.
  const entries = useMemo(
    () =>
      products
        ? WISHLIST_ITEMS.map((saved) => {
            const product = findProduct(saved.productId);
            const priceDropped = saved.savedAtCents > product.price_cents;
            return {
              ...saved,
              product,
              priceDropped,
              savingsCents: priceDropped ? saved.savedAtCents - product.price_cents : 0,
            };
          })
        : [],
    [products, findProduct]
  );

  const priceDropCount = entries.filter((e) => e.priceDropped).length;
  const totalSavingsCents = entries.reduce((sum, e) => sum + e.savingsCents, 0);

  const visibleEntries = entries.filter((e) => {
    if (activeTab === 'price-drop') return e.priceDropped;
    if (activeTab === 'almost-gone') return e.almostGone;
    return true;
  });

  function handleAddToCart(entry) {
    const { product } = entry;
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.slug);
      if (existing) {
        return prev.map((it) => (it.productId === product.slug ? { ...it, qty: it.qty + 1 } : it));
      }
      return [
        ...prev,
        {
          productId: product.slug,
          colorLabel: product.colorways[0]?.label ?? '',
          qty: 1,
          fulfillment: 'delivery',
          surchargeCents: 0,
          selected: true,
        },
      ];
    });
    setAddedIds((prev) => new Set(prev).add(product.slug));
  }

  return (
    <div className="wishlist-root">
      <h1 className="wishlist-title">Save For Later</h1>
      <p className="wishlist-subtitle">
        {priceDropCount} price drop
        {totalSavingsCents > 0 && (
          <>
            {' '}&middot; <span className="wishlist-savings">Total Savings {formatCents(totalSavingsCents)}</span>
          </>
        )}
      </p>

      <div className="wishlist-tabs" role="tablist" aria-label="Filter saved items">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`wishlist-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visibleEntries.length === 0 ? (
        <p className="wishlist-empty">Nothing saved in this filter yet.</p>
      ) : (
        <div className="wishlist-grid">
          {visibleEntries.map((entry) => {
            const { product } = entry;
            return (
              // wishlist-cell is the actual grid item (gets the column's width
              // for free from CSS Grid) and the container-query ancestor
              // .wishlist-card needs - a container can't query its own
              // resolved size, only a descendant can query an ancestor's, so
              // .wishlist-card's own height: calc(100cqw + 100px) needs this
              // wrapper one level up to have anything valid to read.
              <div className="wishlist-cell" key={product.slug}>
                <article className="wishlist-card">
                  <div className="wishlist-card-media">
                    <ProductImage icon={product.icon} size="wishlist" />
                    {entry.priceDropped && <span className="badge badge--success wishlist-card-badge">Price Drop</span>}
                  </div>

                  <p className="wishlist-card-category">{product.category}</p>
                  <h3 className="wishlist-card-name">{product.name}</h3>

                  <p className="wishlist-card-price">
                    {formatCents(product.price_cents)}
                    {entry.priceDropped && (
                      <>
                        <span className="wishlist-card-price-original">{formatCents(entry.savedAtCents)}</span>
                        <span className="wishlist-card-savings">Save {formatCents(entry.savingsCents)}</span>
                      </>
                    )}
                  </p>

                  <p className="wishlist-card-added">Added {entry.addedDaysAgo} days ago</p>

                  <button type="button" className="wishlist-card-add-btn" onClick={() => handleAddToCart(entry)}>
                    <CartIcon aria-hidden="true" />
                    {addedIds.has(product.slug) ? 'Added' : 'Add To Cart'}
                  </button>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
