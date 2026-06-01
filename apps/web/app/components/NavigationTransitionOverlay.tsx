"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getNavigationTitle,
  normalizeNavigationPath,
  shouldPrefetchNavPath,
} from "@lib/navigation";
import { hasRecentNavigationPrefetch } from "@lib/navigation-prefetch";
import {
  NAVIGATION_OVERLAY_DELAY_MS,
  subscribeToNavigationStart,
} from "@lib/navigation-progress";

export default function NavigationTransitionOverlay() {
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeToNavigationStart((nextPath) => {
      const normalisedPath = normalizeNavigationPath(nextPath);

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (
        hasRecentNavigationPrefetch(normalisedPath) ||
        shouldPrefetchNavPath(normalisedPath ?? "")
      ) {
        setPendingPath(null);
        setIsVisible(false);
        return;
      }

      setPendingPath(normalisedPath);
      setIsVisible(false);
      timerRef.current = window.setTimeout(() => {
        setIsVisible(true);
      }, NAVIGATION_OVERLAY_DELAY_MS);
    });
  }, []);

  useEffect(() => {
    const currentPath = normalizeNavigationPath(pathname);

    if (!pendingPath || currentPath !== pendingPath) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const clearTimer = window.setTimeout(() => {
      setPendingPath(null);
      setIsVisible(false);
    }, 0);

    return () => {
      window.clearTimeout(clearTimer);
    };
  }, [pathname, pendingPath]);

  const title = useMemo(() => getNavigationTitle(pendingPath), [pendingPath]);

  if (!pendingPath || !isVisible) {
    return null;
  }

  return (
    <div className="navigation-transition-overlay">
      <div
        className="navigation-transition-card"
        role="status"
        aria-live="polite"
        aria-label={`Loading ${title}`}
      >
        <p className="navigation-transition-kicker">Loading</p>
        <h2 className="navigation-transition-title">{title}</h2>
        <div className="navigation-transition-bars" aria-hidden="true">
          <span className="navigation-transition-bar is-wide" />
          <span className="navigation-transition-bar" />
          <span className="navigation-transition-bar is-short" />
        </div>
      </div>
    </div>
  );
}
