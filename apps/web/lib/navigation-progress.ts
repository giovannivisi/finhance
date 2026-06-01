"use client";

const NAVIGATION_START_EVENT = "finhance:navigation-start";

export const NAVIGATION_OVERLAY_DELAY_MS = 600;

type NavigationStartDetail = {
  path: string;
};

export function startNavigationProgress(path: string) {
  document.dispatchEvent(
    new CustomEvent<NavigationStartDetail>(NAVIGATION_START_EVENT, {
      detail: { path },
    }),
  );
}

export function subscribeToNavigationStart(
  listener: (path: string) => void,
): () => void {
  function handleNavigationStart(event: Event) {
    const detail = (event as CustomEvent<NavigationStartDetail>).detail;
    listener(detail.path);
  }

  document.addEventListener(NAVIGATION_START_EVENT, handleNavigationStart);
  return () => {
    document.removeEventListener(NAVIGATION_START_EVENT, handleNavigationStart);
  };
}
