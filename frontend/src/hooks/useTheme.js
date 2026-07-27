import { useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// A manual light/dark toggle, on top of (not instead of) the CSS
// prefers-color-scheme support everywhere else in this file - initializes
// from whatever the OS already reports, then pins to an explicit choice via
// a data-theme attribute on <html> once the user actually toggles (see
// index.css's :root[data-theme="…"] overrides). useLayoutEffect, not
// useEffect - applies the attribute before the browser paints, so toggling
// (or the very first render's system-matched value) doesn't flash the
// previous theme for a frame first.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || getSystemTheme();
    } catch {
      return getSystemTheme();
    }
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private-browsing/storage-disabled - the toggle still works for this
      // page load via the data-theme attribute, it just won't persist.
    }
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggle };
}
