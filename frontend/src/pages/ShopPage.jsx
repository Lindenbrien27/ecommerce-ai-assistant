import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, FilterIcon } from '../components/icons.jsx';
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

// Layout.jsx's shared .page-header already renders the compact "Shop"
// icon+title for this route (see its PAGE_HEADERS map) - that one stays
// untouched. Everything below is this page's own content, starting with
// its own bigger breadcrumb/title/subtitle block, which is what actually
// replicates the reference design's hero. Two stacked headers, by design:
// shared compact nav chrome above, this page's own hero below it.
export function ShopPage() {
  const [wishlisted, setWishlisted] = useState(() => new Set(DEFAULT_WISHLISTED_IDS));
  const [sortKey, setSortKey] = useState('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  // Reopens on every mount (full page load, or navigating back to /shop) -
  // a promo popup, not a one-time dismissal this app would need to
  // persist anywhere.
  const [shopNowOpen, setShopNowOpen] = useState(true);

  const { products, error } = useProducts();
  const visibleCategories = products ? [...new Set(products.map((p) => p.category))] : [];

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    const filtered = activeCategory ? products.filter((p) => p.category === activeCategory) : products;
    return sortProducts(filtered, sortKey);
  }, [products, activeCategory, sortKey]);

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
          <h2 className="shop-hero-title">All Products</h2>
          <p className="shop-hero-subtitle">Audio, workspace gear, and everyday essentials — all in one place.</p>
        </div>

        <div className="shop-hero-actions">
          <button
            type="button"
            className={`shop-filter-toggle${filtersOpen ? ' active' : ''}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-pressed={filtersOpen}
          >
            <FilterIcon aria-hidden="true" /> Show Filters
          </button>

          <div className="shop-sort">
            <button
              type="button"
              className="shop-sort-trigger"
              onClick={() => setSortOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
            >
              Sort by: {activeSortLabel} <ChevronDownIcon aria-hidden="true" />
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

      {filtersOpen && (
        <div className="shop-filter-row" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`pill shop-filter-chip${activeCategory === null ? ' active' : ''}`}
            onClick={() => setActiveCategory(null)}
            aria-pressed={activeCategory === null}
          >
            All
          </button>
          {visibleCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={`pill shop-filter-chip${activeCategory === category ? ' active' : ''}`}
              onClick={() => setActiveCategory(category)}
              aria-pressed={activeCategory === category}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
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
      )}
    </div>
  );
}
