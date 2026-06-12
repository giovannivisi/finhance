import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NavigationTransitionOverlay from "@components/NavigationTransitionOverlay";
import {
  recordNavigationPrefetch,
  resetNavigationPrefetchesForTests,
} from "@lib/navigation-prefetch";

const usePathnameMock = vi.fn();

let navigationStartListener: ((path: string) => void) | null = null;

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("@lib/navigation-progress", () => ({
  NAVIGATION_OVERLAY_DELAY_MS: 600,
  subscribeToNavigationStart: (listener: (path: string) => void) => {
    navigationStartListener = listener;
    return () => {
      navigationStartListener = null;
    };
  },
}));

describe("NavigationTransitionOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNavigationPrefetchesForTests();
    usePathnameMock.mockReturnValue("/transactions");
    navigationStartListener = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the overlay for slow non-prefetched navigations", () => {
    render(<NavigationTransitionOverlay />);

    act(() => {
      navigationStartListener?.("/privacy");
      vi.advanceTimersByTime(600);
    });

    expect(
      screen.getByRole("status", { name: "Loading Loading" }),
    ).toBeInTheDocument();
  });

  it("does not show the overlay when the target route was prefetched", () => {
    recordNavigationPrefetch("/dashboard");
    render(<NavigationTransitionOverlay />);

    act(() => {
      navigationStartListener?.("/dashboard");
      vi.advanceTimersByTime(600);
    });

    expect(
      screen.queryByRole("status", { name: "Loading Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("does not show the overlay for primary warmed routes", () => {
    render(<NavigationTransitionOverlay />);

    act(() => {
      navigationStartListener?.("/dashboard");
      vi.advanceTimersByTime(600);
    });

    expect(
      screen.queryByRole("status", { name: "Loading Dashboard" }),
    ).not.toBeInTheDocument();
  });
});
