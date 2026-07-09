import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
}
