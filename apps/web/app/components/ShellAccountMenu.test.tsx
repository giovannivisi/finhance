import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShellAccountMenu from "@components/ShellAccountMenu";

const toggleThemeMock = vi.fn();

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

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    theme: "dark",
    toggleTheme: toggleThemeMock,
    hideMoney: false,
    isHydrated: true,
    toggleHideMoney: vi.fn(),
    hasAttemptedDashboardRefresh: vi.fn(),
    markDashboardRefreshAttempted: vi.fn(),
  }),
}));

describe("ShellAccountMenu", () => {
  beforeEach(() => {
    toggleThemeMock.mockReset();
  });

  it("renders local identity, links, and the remaining future settings placeholder", async () => {
    const user = userEvent.setup();

    render(
      <ShellAccountMenu
        identity={{
          title: "Local workspace",
          subtitle: "Private on this device",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByText("Local workspace")).toBeInTheDocument();
    expect(screen.getByText("Private on this device")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Privacy notice" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("menuitem", { name: "User settings" }),
    ).toHaveAttribute("href", "/settings/user");
    expect(
      screen.getByRole("menuitem", { name: /switch to light mode/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", {
        name: /app settings will land in a later pass/i,
      }),
    ).toBeDisabled();
  });

  it("renders hosted identity and closes after toggling theme", async () => {
    const user = userEvent.setup();

    render(
      <ShellAccountMenu
        identity={{
          title: "Giovanni Visi",
          subtitle: "giovanni@example.com",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByText("Giovanni Visi")).toBeInTheDocument();
    expect(screen.getByText("giovanni@example.com")).toBeInTheDocument();

    await user.click(
      screen.getByRole("menuitem", { name: /switch to light mode/i }),
    );

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull(),
    );
  });
});
