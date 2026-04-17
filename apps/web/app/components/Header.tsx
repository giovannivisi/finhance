"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ThemeToggle } from "./ThemeToggle";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
    <header className="hidden lg:flex w-full sticky top-0 z-40 items-center justify-between py-6 px-8 mb-8 backdrop-blur-3xl bg-surface/80">
      <Link
        href="/"
        className="text-4xl font-heading font-extrabold tracking-[-0.05em] text-onSurface flex items-center gap-2"
      >
        <span className="text-primary">✦</span>
        finhance
      </Link>

      <nav className="flex items-center gap-2 bg-surfaceContainerLow rounded-full p-1 border border-outlineVariant/10">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname?.startsWith(link.href));
          return (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-sans font-medium transition-all duration-300",
                isActive
                  ? "bg-surfaceContainerLowest text-onSurface shadow-sm"
                  : "text-onSurfaceVariant hover:text-onSurface",
              )}
            >
              {link.name}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <div className="w-12 h-12 rounded-full border border-outlineVariant/20 bg-surfaceContainerLow flex items-center justify-center pointer-events-none">
          <span className="text-onSurface font-heading font-bold">GV</span>
        </div>
      </div>
    </header>
  );
}
