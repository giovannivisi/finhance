"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getRouteSuccessorPrefetchPaths,
  normalizeNavigationPath,
} from "@lib/navigation";
import { recordNavigationPrefetch } from "@lib/navigation-prefetch";

const INITIAL_PREFETCH_DELAY_MS = 160;
const PREFETCH_STAGGER_MS = 120;

export default function NavigationPrefetchCoordinator() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const currentPath = normalizeNavigationPath(pathname) ?? "/dashboard";
    const prefetchPaths = getRouteSuccessorPrefetchPaths(currentPath).filter(
      (candidate) => normalizeNavigationPath(candidate) !== currentPath,
    );

    if (prefetchPaths.length === 0) {
      return;
    }

    const timeoutIds = prefetchPaths.map((path, index) =>
      window.setTimeout(() => {
        if (!recordNavigationPrefetch(path)) {
          return;
        }

        router.prefetch(path);
      }, INITIAL_PREFETCH_DELAY_MS + index * PREFETCH_STAGGER_MS),
    );

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [pathname, router]);

  return null;
}
