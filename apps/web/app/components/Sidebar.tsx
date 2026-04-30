"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Moon, Sun } from "lucide-react";
import {
  DESKTOP_NAV_ITEMS,
  isActivePath,
  type AppNavItem,
} from "@lib/navigation";
import { useTheme } from "@components/ThemeProvider";

function DesktopNavLink({
  item,
  currentPath,
}: {
  item: AppNavItem;
  currentPath: string | null;
}) {
  const isActive = isActivePath(currentPath, item.href);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`desktop-nav-link${isActive ? " is-active" : ""}`}
    >
      <item.icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const privacyIsActive = isActivePath(pathname, "/privacy");

  return (
    <aside className="desktop-nav" aria-label="Primary navigation">
      <div className="desktop-nav-card">
        <nav className="desktop-nav-list">
          {DESKTOP_NAV_ITEMS.map((item) => (
            <DesktopNavLink
              key={item.href}
              item={item}
              currentPath={pathname}
            />
          ))}
        </nav>

        <div className="desktop-nav-meta">
          <Link
            href="/privacy"
            aria-current={privacyIsActive ? "page" : undefined}
            className={`desktop-nav-link desktop-nav-link--subtle${
              privacyIsActive ? " is-active" : ""
            }`}
          >
            <FileText size={18} aria-hidden="true" />
            <span>Privacy notice</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="desktop-nav-theme-btn"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>
    </aside>
  );
}
