import React from "react";
import { act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NavigationPrefetchCoordinator from "@components/NavigationPrefetchCoordinator";
import { resetNavigationPrefetchesForTests } from "@lib/navigation-prefetch";

const prefetchMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ prefetch: prefetchMock }),
}));

describe("NavigationPrefetchCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefetchMock.mockReset();
    resetNavigationPrefetchesForTests();
    usePathnameMock.mockReturnValue("/dashboard");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefetches the next likely routes after navigation settles", () => {
    render(<NavigationPrefetchCoordinator />);

    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(prefetchMock).toHaveBeenCalledWith("/transactions");

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(prefetchMock).toHaveBeenCalledWith("/setup");
  });

  it("keeps dashboard warm as a return route from other pages", () => {
    usePathnameMock.mockReturnValue("/transactions");

    render(<NavigationPrefetchCoordinator />);

    act(() => {
      vi.advanceTimersByTime(280);
    });

    expect(prefetchMock).toHaveBeenCalledWith("/accounts");
    expect(prefetchMock).toHaveBeenCalledWith("/dashboard");
    expect(prefetchMock).not.toHaveBeenCalledWith("/transactions");
  });
});
