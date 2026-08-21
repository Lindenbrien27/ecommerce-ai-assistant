import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../components/icons.jsx';
import { ProductCard } from '../components/ProductCard.jsx';
import { ShopNowDialog } from '../components/ShopNowDialog.jsx';
import { DEFAULT_WISHLISTED_IDS } from '../data/shopProducts.js';
import { useProducts } from '../context/ProductsContext.jsx';

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name A–Z' },
];

function sortProducts(products, sortKey) {
  if (sortKey === 'newest') return products;
  const sorted = [...products];
  if (sortKey === 'price-asc') sorted.sort((a, b) => a.price_cents - b.price_cents);
  else if (sortKey === 'price-desc') sorted.sort((a, b) => b.price_cents - a.price_cents);
  else if (sortKey === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export function ShopPage() {
  const [wishlisted, setWishlisted] = useState(() => new Set(DEFAULT_WISHLISTED_IDS));
  const [sortKey, setSortKey] = useState('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  const [shopNowOpen, setShopNowOpen] = useState(true);

  const { products, error } = useProducts();
  const visibleCategories = products ? [...new Set(products.map((p) => p.category))] : [];

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    return sortProducts(products, sortKey);
  }, [products, sortKey]);

  const categoryCounts = useMemo(() => {
    const counts = new Map();
    for (const product of sortedProducts) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return counts;
  }, [sortedProducts]);

  const visibleProducts = activeCategory ? sortedProducts.filter((p) => p.category === activeCategory) : sortedProducts;

  function toggleWishlist(id) {
    setWishlisted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey).label;

  return (
    <div className="shop-page-root">
      {shopNowOpen && <ShopNowDialog onClose={() => setShopNowOpen(false)} />}

      <nav className="shop-breadcrumb" aria-label="Breadcrumb">
        <span>Shop</span>
        <ChevronRightIcon aria-hidden="true" />
        <span aria-current="page">All Products</span>
      </nav>

      <div className="shop-hero">
        <div>
          <h2 className="shop-hero-title">
            The desk, the door, <em>the drawer.</em>
          </h2>
          <p className="shop-hero-subtitle">Six categories, one cart — real stock, real prices, restocked weekly.</p>
        </div>

        <div className="shop-hero-actions">
          <div className="shop-sort">
            <button
              type="button"
              className="shop-sort-trigger"
              onClick={() => setSortOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
            >
              Sort: {activeSortLabel} <ChevronDownIcon aria-hidden="true" />
            </button>

            {sortOpen && (
              <>
                <div className="popover-catcher" onClick={() => setSortOpen(false)} />
                <div className="sort-popover open" role="menu" aria-label="Sort by">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitem"
                      className={`sort-popover-item${sortKey === option.key ? ' active' : ''}`}
                      onClick={() => {
                        setSortKey(option.key);
                        setSortOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && products && products.length > 0 && (
        <>
          <nav className="shop-tabs" aria-label="Filter by category">
            <button
              type="button"
              className={`shop-tab${activeCategory === null ? ' active' : ''}`}
              aria-label="All"
              onClick={() => setActiveCategory(null)}
            >
              All <span className="shop-tab-count">{products.length}</span>
            </button>
            {visibleCategories.map((category) => (
              <button
                key={category}
                type="button"
                className={`shop-tab${activeCategory === category ? ' active' : ''}`}
                aria-label={category}
                onClick={() => setActiveCategory(category)}
              >
                {category} <span className="shop-tab-count">{categoryCounts.get(category)}</span>
              </button>
            ))}
          </nav>

          <div className="shop-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.slug}
                product={product}
                wishlisted={wishlisted.has(product.slug)}
                onToggleWishlist={() => toggleWishlist(product.slug)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
