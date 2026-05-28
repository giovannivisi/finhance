import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@components/Sidebar";

const pushMock = vi.fn();
const usePathnameMock = vi.fn();
const startNavigationProgressMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock }),
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
    startNavigationProgressMock.mockReset();
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
});
