"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DESKTOP_NAV_ITEMS,
  isActivePath,
  type AppNavItem,
} from "@lib/navigation";

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
      </div>
    </aside>
  );
}
