import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none transition-colors hover:bg-card focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_rgba(161,161,161,0.5)]"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
