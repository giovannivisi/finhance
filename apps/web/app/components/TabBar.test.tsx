import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabBar from "@components/TabBar";

const pushMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={(event) => onClick?.(event)} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
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

describe("TabBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    usePathnameMock.mockReturnValue("/accounts");
  });

  it("does not push when the user clicks the already active tab", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByLabelText("Wallets"));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("opens the More panel and pushes secondary navigation targets", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));
    await user.click(screen.getByRole("link", { name: "Analytics" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/analytics");
    });
  });

  it("keeps the More panel focused on secondary navigation", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));

    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
    expect(
      screen.queryByText("Workspace"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Privacy notice" }),
    ).not.toBeInTheDocument();
  });
});
