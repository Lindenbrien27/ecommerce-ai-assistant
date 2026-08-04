import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons.jsx';

// Real, working version of the reference's "c-dropdown-menu-18" style
// custom select (Role/Card brand) - same open/close/click-outside-catcher
// idiom this app already uses for ProfileMenu's own popover, not a native
// <select> (which can't be restyled to match the reference's dropdown
// panel) and not the mockup's fake-readonly version.
export function SettingsDropdown({ id, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`settings-select${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        id={id}
        className="settings-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      {open && (
        <div className="settings-select-menu" role="listbox" aria-labelledby={id}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`settings-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
