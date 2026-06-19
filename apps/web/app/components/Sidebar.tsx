"use client";

import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DESKTOP_NAV_ITEMS,
  isActivePath,
  isPublicAuthPath,
  isRedundantTabNavigation,
  shouldPrefetchNavPath,
  type AppNavItem,
} from "@lib/navigation";
import { recordNavigationPrefetch } from "@lib/navigation-prefetch";
import { startNavigationProgress } from "@lib/navigation-progress";

interface PendingNavigationState {
  originPath: string;
  targetPath: string;
}

function DesktopNavLink({
  item,
  currentPath,
  pendingPath,
  onNavigate,
  onPrefetch,
}: {
  item: AppNavItem;
  currentPath: string | null;
  pendingPath: string | null;
  onNavigate: (path: string) => void;
  onPrefetch: (path: string) => void;
}) {
  const isActive = isActivePath(currentPath, item.href);
  const isBlocked = isRedundantTabNavigation({
    currentPath: currentPath ?? "/",
    targetPath: item.href,
    pendingPath,
  });

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      onNavigate(item.href);
    },
    [item.href, onNavigate],
  );

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={isBlocked || undefined}
      onClick={handleClick}
      onMouseEnter={() => onPrefetch(item.href)}
      onFocus={() => onPrefetch(item.href)}
      onTouchStart={() => onPrefetch(item.href)}
      className={`desktop-nav-link${isActive ? " is-active" : ""}`}
    >
      <item.icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigationState | null>(null);
  const currentPath = pathname ?? "/";
  const shouldHideNavigation = isPublicAuthPath(currentPath);

  const activePendingPath =
    pendingNavigation?.originPath === currentPath
      ? pendingNavigation.targetPath
      : null;

  const handleNavigate = useCallback(
    (nextPath: string) => {
      if (
        isRedundantTabNavigation({
          currentPath,
          targetPath: nextPath,
          pendingPath: activePendingPath,
        })
      ) {
        return;
      }

      setPendingNavigation({
        originPath: currentPath,
        targetPath: nextPath,
      });
      startNavigationProgress(nextPath);
      router.push(nextPath);
    },
    [activePendingPath, currentPath, router],
  );

  const prefetchPath = useCallback(
    (nextPath: string) => {
      if (!recordNavigationPrefetch(nextPath)) {
        return;
      }

      router.prefetch(nextPath);
    },
    [router],
  );

  const handlePrefetch = useCallback(
    (nextPath: string) => {
      if (!shouldPrefetchNavPath(nextPath)) {
        return;
      }

      prefetchPath(nextPath);
    },
    [prefetchPath],
  );

  if (shouldHideNavigation) {
    return null;
  }

  return (
    <aside className="desktop-nav" aria-label="Primary navigation">
      <div className="desktop-nav-card">
        <nav className="desktop-nav-list">
          {DESKTOP_NAV_ITEMS.map((item) => (
            <DesktopNavLink
              key={item.href}
              item={item}
              currentPath={currentPath}
              pendingPath={activePendingPath}
              onNavigate={handleNavigate}
              onPrefetch={handlePrefetch}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
