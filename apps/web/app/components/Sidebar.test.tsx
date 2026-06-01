import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@components/Sidebar";

const usePathnameMock = vi.fn();
const toggleThemeMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
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

vi.mock("@components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: toggleThemeMock,
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/accounts");
    toggleThemeMock.mockReset();
  });

  it("shows a global privacy notice link in shared navigation", () => {
    render(<Sidebar />);

    expect(
      screen.getByRole("link", { name: "Privacy notice" }),
    ).toHaveAttribute("href", "/privacy");
  });
});
