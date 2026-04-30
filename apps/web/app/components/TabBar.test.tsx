import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabBar from "@components/TabBar";

const pushMock = vi.fn();
const usePathnameMock = vi.fn();
const toggleThemeMock = vi.fn();

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
  useReducedMotion: () => true,
}));

vi.mock("@components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: toggleThemeMock,
  }),
}));

describe("TabBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    toggleThemeMock.mockReset();
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

  it("shows the privacy notice link in the More panel", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));
    await user.click(screen.getByRole("link", { name: "Privacy notice" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/privacy");
    });
  });

  it("toggles theme from the More panel and closes it", async () => {
    const user = userEvent.setup();
    render(<TabBar />);

    await user.click(screen.getByRole("button", { name: /more navigation/i }));
    await user.click(
      screen.getByRole("button", { name: /switch to light mode/i }),
    );

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText("Light mode")).not.toBeInTheDocument();
    });
  });
});
