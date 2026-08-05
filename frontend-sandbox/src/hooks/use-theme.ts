import { useEffect, useState } from "react";

const STORAGE_KEY = "sandbox-theme";

function getInitialTheme(): "light" | "dark" {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Simple on/off toggle (not the main app's 3-way light/dark/system) - this
// is a component sandbox, not a real product with a system-preference
// requirement. Persists to localStorage so the choice survives a reload.
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggle };
}
