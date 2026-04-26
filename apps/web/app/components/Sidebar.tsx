"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isRedundantTabNavigation } from "@lib/navigation";
import { useTheme } from "@components/ThemeProvider";

const PRIMARY_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/history", label: "History" },
] as const;

const SECONDARY_NAV = [
  { href: "/analytics", label: "Analytics" },
  { href: "/budgets", label: "Budgets" },
  { href: "/recurring", label: "Recurring" },
  { href: "/review", label: "Review" },
  { href: "/categories", label: "Categories" },
  { href: "/import", label: "Import" },
] as const;

function SidebarLink({
  href,
  label,
  currentPath,
  pendingPath,
  onNavigate,
  isSecondary = false,
}: {
  href: string;
  label: string;
  currentPath: string;
  pendingPath: string | null;
  onNavigate: (href: string) => void;
  isSecondary?: boolean;
}) {
  const isCurrent = isRedundantTabNavigation({
    currentPath,
    targetPath: href,
  });
  const isBlocked = isRedundantTabNavigation({
    currentPath,
    targetPath: href,
    pendingPath,
  });

  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={isCurrent ? "page" : undefined}
      aria-disabled={isBlocked}
      onClick={(event) => {
        if (isBlocked) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onNavigate(href);
      }}
      className={`sidebar-link ${isSecondary ? "sidebar-link-secondary" : "sidebar-link-primary"} ${isCurrent ? "active" : ""}`}
    >
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const currentPath = pathname ?? "/";
  const activePendingPath = isPending ? pendingPath : null;

  function handleNavigate(nextPath: string) {
    setPendingPath(nextPath);
    setShowMore(false);
    startTransition(() => {
      router.push(nextPath);
    });
  }

  return (
    <aside className="layout-sidebar">
      <nav className="sidebar-nav-primary">
        {PRIMARY_NAV.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            currentPath={currentPath}
            pendingPath={activePendingPath}
            onNavigate={handleNavigate}
          />
        ))}
      </nav>

      <div className="sidebar-nav-secondary-container">
        <button
          className={`sidebar-link sidebar-link-primary ${showMore ? "active" : ""}`}
          onClick={() => setShowMore(!showMore)}
        >
          More
        </button>
        {showMore && (
          <nav className="sidebar-nav-secondary">
            {SECONDARY_NAV.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                currentPath={currentPath}
                pendingPath={activePendingPath}
                onNavigate={handleNavigate}
                isSecondary={true}
              />
            ))}
            <div
              style={{
                height: "1px",
                background: "var(--border-glass-strong)",
                margin: "4px 0",
              }}
            />
            <button
              onClick={() => {
                toggleTheme();
                setShowMore(false);
              }}
              className="sidebar-link sidebar-link-secondary"
              style={{
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              <span style={{ fontSize: "16px" }}>
                {theme === "dark" ? "☀️" : "🌙"}
              </span>
            </button>
          </nav>
        )}
      </div>
    </aside>
  );
}
