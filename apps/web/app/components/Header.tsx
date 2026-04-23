"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isRedundantTabNavigation } from "@lib/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/recurring", label: "Recurring" },
  { href: "/review", label: "Review" },
  { href: "/history", label: "History" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
  { href: "/import", label: "Import" },
] as const;

function HeaderLink({
  href,
  label,
  currentPath,
  pendingPath,
  onNavigate,
}: {
  href: string;
  label: string;
  currentPath: string;
  pendingPath: string | null;
  onNavigate: (href: string) => void;
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
      className={
        isCurrent
          ? "text-gray-900"
          : "hover:text-gray-900 transition-colors disabled:pointer-events-none"
      }
    >
      {label}
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const currentPath = pathname ?? "/";
  const activePendingPath = isPending ? pendingPath : null;

  function handleNavigate(nextPath: string) {
    setPendingPath(nextPath);
    startTransition(() => {
      router.push(nextPath);
    });
  }

  return (
    <header className="w-full bg-white shadow-sm">
      <div className="flex w-full items-center justify-between gap-6 px-8 py-6">
        <HeaderLink
          href="/"
          label="finhance"
          currentPath={currentPath}
          pendingPath={activePendingPath}
          onNavigate={handleNavigate}
        />

        <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
          {NAV_ITEMS.map((item) => (
            <HeaderLink
              key={item.href}
              href={item.href}
              label={item.label}
              currentPath={currentPath}
              pendingPath={activePendingPath}
              onNavigate={handleNavigate}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}
