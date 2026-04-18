"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { name: "Dashboard", href: "/" },
  { name: "Transactions", href: "/transactions" },
  { name: "History", href: "/history" },
  { name: "Accounts", href: "/accounts" },
  { name: "Categories", href: "/categories" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="header-nav">
      <Link
        href="/"
        className="flex-row items-center gap-2"
        style={{ textDecoration: "none" }}
      >
        <span className="text-h2 text-gradient">✦ finhance</span>
      </Link>

      <nav className="header-links">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname?.startsWith(link.href));
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`header-link ${isActive ? "active" : ""}`}
            >
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div className="flex-row items-center gap-4">
        <ThemeToggle />
        <div
          className="flex-row items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--bg-card-solid)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            fontWeight: "bold",
            pointerEvents: "none",
          }}
        >
          <span>GV</span>
        </div>
      </div>
    </header>
  );
}
