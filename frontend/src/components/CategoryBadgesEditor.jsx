import { useState } from 'react';
import { useOrders } from '../context/OrdersContext.jsx';
import { PRODUCT_ICONS } from './icons.jsx';

// Same 5 real products this app actually sells (see PRODUCT_ICONS) - not a
// separate category taxonomy, so a badge's icon is always the same glyph
// ProductImage.jsx would fall back to for that product.
const CATEGORIES = [
  { key: 'headphones', label: 'Audio' },
  { key: 'cable', label: 'Cables' },
  { key: 'keyboard', label: 'Peripherals' },
  { key: 'chair', label: 'Furniture' },
  { key: 'monitor', label: 'Displays' },
];

// Sidebar's Category filter - the main view only ever shows which
// categories are *active* (no per-badge remove control cluttering it, see
// the badges-card markup below); all editing happens in a floating
// popover anchored to this card, opened by "Edit". Edits are staged in a
// local draft Set and only replace the real, order-list-filtering
// selectedCategories (see OrdersContext) on "Save changes" - closing via
// the ✕ or clicking outside discards the draft instead of silently
// applying a half-finished edit.
export function CategoryBadgesEditor() {
  const { selectedCategories, setSelectedCategories } = useOrders();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Set(selectedCategories));

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
    <div className="badges-card">
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

      {open && (
        <>
          {/* Closes on outside click without saving - the same "discard,
              don't silently apply" behavior as the ✕ button. */}
          <div className="popover-catcher" onClick={() => setOpen(false)} />
          <aside className="edit-popover open" aria-label="Edit category badges">
            <div className="popover-head">
              <h2>Edit Category Badges</h2>
              <button type="button" className="popover-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="popover-body">
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
        </>
      )}
    </div>
  );
}
