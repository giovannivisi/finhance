import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@components/Sidebar";

const usePathnameMock = vi.fn();

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

describe("Sidebar", () => {
  beforeEach(() => {
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
});
