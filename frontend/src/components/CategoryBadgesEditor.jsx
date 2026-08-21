import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOrders } from '../context/OrdersContext.jsx';
import { PRODUCT_ICONS } from './icons.jsx';

const CATEGORIES = [
  { key: 'headphones', label: 'Audio' },
  { key: 'cable', label: 'Cables' },
  { key: 'keyboard', label: 'Peripherals' },
  { key: 'chair', label: 'Furniture' },
  { key: 'monitor', label: 'Displays' },
];

export function CategoryBadgesEditor() {
  const { selectedCategories, setSelectedCategories } = useOrders();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Set(selectedCategories));
  const cardRef = useRef(null);

  const [popoverStyle, setPopoverStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPopoverStyle({
      top: rect.top,
      left: rect.right + 12,
      maxHeight: Math.max(200, window.innerHeight - rect.top - 16),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollParent = cardRef.current?.closest('.storefront-sidenav');
    if (!scrollParent) return;
    const closeOnScroll = () => setOpen(false);
    scrollParent.addEventListener('scroll', closeOnScroll);
    return () => scrollParent.removeEventListener('scroll', closeOnScroll);
  }, [open]);

  function openEditor() {
    setDraft(new Set(selectedCategories));
    setOpen(true);
  }

  function removeFromDraft(key) {
    setDraft((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function addToDraft(key) {
    setDraft((prev) => new Set(prev).add(key));
  }

  function save() {
    setSelectedCategories(draft);
    setOpen(false);
  }

  const activeBadges = CATEGORIES.filter((c) => selectedCategories.has(c.key));
  const draftActive = CATEGORIES.filter((c) => draft.has(c.key));
  const draftAvailable = CATEGORIES.filter((c) => !draft.has(c.key));

  return (
    <div className="badges-card" ref={cardRef}>
      <div className="badges-card-head">
        <span className="badges-card-label">Category</span>
        <button type="button" className="badges-edit-btn" onClick={openEditor}>
          Edit
        </button>
      </div>

      <div className="badges-active-row">
        {activeBadges.length === 0 ? (
          <p className="badges-empty-note">No categories selected.</p>
        ) : (
          activeBadges.map(({ key, label }) => {
            const Icon = PRODUCT_ICONS[key];
            return (
              <span className="badge-pill" key={key}>
                <Icon aria-hidden="true" />
                {label}
              </span>
            );
          })
        )}
      </div>

      {open && popoverStyle && createPortal(
        <>
          {}
          <div className="popover-catcher" onClick={() => setOpen(false)} />
          <aside
            className="edit-popover open"
            aria-label="Edit category badges"
            style={{
              top: `${popoverStyle.top}px`,
              left: `${popoverStyle.left}px`,
              maxHeight: `${popoverStyle.maxHeight}px`,
            }}
          >
            <div className="popover-head">
              <h2>Edit Category Badges</h2>
              <button type="button" className="popover-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="popover-body slim-scroll">
              <p className="popover-section-label">
                Active Badges (<span>{draftActive.length}</span>)
              </p>
              <div className="badge-list">
                {draftActive.length === 0 ? (
                  <p className="badges-empty-note">No badges active - add one below.</p>
                ) : (
                  draftActive.map(({ key, label }) => {
                    const Icon = PRODUCT_ICONS[key];
                    return (
                      <div className="badge-row" key={key}>
                        <span className="badge-row-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="badge-row-label">{label}</span>
                        <button
                          type="button"
                          className="badge-row-btn remove"
                          onClick={() => removeFromDraft(key)}
                          aria-label={`Remove ${label}`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <hr className="popover-divider" />

              <p className="popover-section-label">Available Badges</p>
              <div className="badge-list">
                {draftAvailable.length === 0 ? (
                  <p className="badges-empty-note">All badges are active.</p>
                ) : (
                  draftAvailable.map(({ key, label }) => {
                    const Icon = PRODUCT_ICONS[key];
                    return (
                      <button
                        type="button"
                        className="badge-row available-row"
                        key={key}
                        onClick={() => addToDraft(key)}
                      >
                        <span className="badge-row-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="badge-row-label">{label}</span>
                        <span className="badge-row-btn add" aria-hidden="true">
                          +
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="popover-footer">
              <button type="button" className="popover-save" onClick={save}>
                Save changes
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
