import { useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Three-way mode - 'light'/'dark' pin an explicit choice (via a data-theme
// attribute on <html>, same as before), 'system' removes that attribute
// entirely and lets index.css's own prefers-color-scheme media query
// govern, so a later OS-level theme change is picked up live instead of
// staying pinned to whatever the system happened to report at the moment
// 'system' was chosen. mode is the user's own stored choice (what the
// ProfileMenu's theme trio shows as selected); theme is the resolved
// light/dark value callers actually render against (e.g. which icon a
// theme button shows) - they only differ while mode === 'system'.
// useLayoutEffect, not useEffect, for the attribute write - applies before
// paint so switching modes (or the very first system-matched render)
// doesn't flash the previous theme for a frame first.
export function useTheme() {
  const [mode, setMode] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  });
  const [theme, setTheme] = useState(() => (mode === 'system' ? getSystemTheme() : mode));

  useLayoutEffect(() => {
    if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme');
      setTheme(getSystemTheme());
    } else {
      document.documentElement.setAttribute('data-theme', mode);
      setTheme(mode);
    }
    try {
      if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private-browsing/storage-disabled - the choice still applies for
      // this page load via the data-theme attribute, it just won't persist.
    }
  }, [mode]);

  // Only relevant while following the system - re-resolves theme (for
  // anything reading it, e.g. an icon) if the OS preference changes without
  // the user ever touching the theme trio themselves.
  useEffect(() => {
    if (mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getSystemTheme());
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [mode]);

  return { mode, theme, setMode };
}
