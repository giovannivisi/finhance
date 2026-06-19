import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabBar from "@components/TabBar";
import { resetNavigationPrefetchesForTests } from "@lib/navigation-prefetch";

const pushMock = vi.fn();
const prefetchMock = vi.fn();
const usePathnameMock = vi.fn();
const startNavigationProgressMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock, prefetch: prefetchMock }),
}));

vi.mock("next/link", () => ({
  default: (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      prefetch?: boolean;
    },
  ) => {
    const { children, href, onClick, prefetch, ...rest } = props;
    void prefetch;

    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: (
      props: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown },
    ) => {
      const { children, initial, ...rest } = props;
      void initial;

      return <div {...rest}>{children}</div>;
    },
  },
  useAnimation: () => ({
    set: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
  useReducedMotion: () => true,
}));

vi.mock("@components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@lib/navigation-progress", () => ({
  startNavigationProgress: (path: string) => startNavigationProgressMock(path),
}));

describe("TabBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    prefetchMock.mockReset();
    startNavigationProgressMock.mockReset();
    resetNavigationPrefetchesForTests();
    usePathnameMock.mockReturnValue("/accounts");
  });

  it("does not push when the user clicks the already active tab", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByLabelText("Wallets"));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("hides the mobile tab bar on public auth pages", () => {
    usePathnameMock.mockReturnValue("/signup");

    render(<TabBar />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("clears a completed pending route so the same destination can be revisited later", async () => {
    const user = userEvent.setup();
    usePathnameMock.mockReturnValue("/analytics");
    const { rerender } = render(<TabBar />);

    await user.click(screen.getByLabelText("Dashboard"));

    expect(pushMock).toHaveBeenNthCalledWith(1, "/dashboard");

    usePathnameMock.mockReturnValue("/dashboard");
    rerender(<TabBar />);

    usePathnameMock.mockReturnValue("/categories");
    rerender(<TabBar />);

    await user.click(screen.getByLabelText("Dashboard"));

    expect(pushMock).toHaveBeenNthCalledWith(2, "/dashboard");
  });

  it("opens the More panel and pushes secondary navigation targets", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));
    await user.click(screen.getByRole("link", { name: "Analytics" }));

    await waitFor(() => {
      expect(startNavigationProgressMock).toHaveBeenCalledWith("/analytics");
      expect(pushMock).toHaveBeenCalledWith("/analytics");
    });
  });

  it("keeps the More panel focused on secondary navigation", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));

    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
    expect(prefetchMock).toHaveBeenCalledWith("/brokerage");
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Privacy notice" }),
    ).not.toBeInTheDocument();
  });

  it("prefetches primary routes on hover and brokerage when More opens", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.hover(screen.getByLabelText("Analytics"));
    await user.click(screen.getByRole("button", { name: /more navigation/i }));

    expect(prefetchMock).toHaveBeenCalledWith("/analytics");
    expect(prefetchMock).toHaveBeenCalledWith("/brokerage");
  });

  it("prefetches secondary follow-up routes when More stays open briefly", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));

    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith("/history");
      expect(prefetchMock).toHaveBeenCalledWith("/review");
    });
  });
});
