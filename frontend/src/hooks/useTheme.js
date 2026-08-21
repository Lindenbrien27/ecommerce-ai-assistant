import { useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

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

    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getSystemTheme());
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [mode]);

  return { mode, theme, setMode };
}
