import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@components/Sidebar";
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
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@lib/navigation-progress", () => ({
  startNavigationProgress: (path: string) => startNavigationProgressMock(path),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    prefetchMock.mockReset();
    startNavigationProgressMock.mockReset();
    resetNavigationPrefetchesForTests();
    usePathnameMock.mockReturnValue("/accounts");
  });

  it("keeps the desktop sidebar focused on primary navigation only", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Wallets" })).toHaveAttribute(
      "href",
      "/accounts",
    );
    expect(
      screen.queryByRole("link", { name: "Privacy notice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /switch to light mode/i }),
    ).not.toBeInTheDocument();
  });

  it("starts delayed navigation feedback before pushing a new route", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("link", { name: "Analytics" }));

    expect(startNavigationProgressMock).toHaveBeenCalledWith("/analytics");
    expect(pushMock).toHaveBeenCalledWith("/analytics");
  });

  it("prefetches selected routes on hover intent", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.hover(screen.getByRole("link", { name: "Analytics" }));
    await user.hover(screen.getByRole("link", { name: "Brokerage" }));
    await user.hover(screen.getByRole("link", { name: "History" }));

    expect(prefetchMock).toHaveBeenCalledWith("/analytics");
    expect(prefetchMock).toHaveBeenCalledWith("/brokerage");
    expect(prefetchMock).not.toHaveBeenCalledWith("/history");
  });
});
