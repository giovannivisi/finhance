"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="theme-toggle-btn" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="theme-toggle-btn"
      title="Toggle Theme"
      aria-label="Toggle Theme"
    >
      <Sun className="sun" size={20} />
      <Moon className="moon" size={20} />
    </button>
  );
}
